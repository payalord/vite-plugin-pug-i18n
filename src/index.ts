import path from "path"
import fs from "fs"
import pug from "pug"
import i18next, { InitOptions } from "i18next"

/**
 * Pages options
 * @param baseDir string
 */
interface PagesOptions {
    baseDir: string
}

type Translate = (langCode: string) => (a: string) => string
type FallbackLng = string | Array<string> | object

/**
 * Language options
 * @param baseDir string
 * @param fallbackLng FallBackLng
 * @param translate Translate
 */
interface LangsOptions {
    baseDir: string,
    fallbackLng: FallbackLng | ((code: string) => FallbackLng) | false | undefined,
    translate: Translate
}

/**
 * Plugin options
 * @param pages PagesOptions
 * @param langs LangsOptions
 * @param locals object
 * @param options object
 * @param i18nInitOptions InitOptions
 * @param baseDir string
 */
interface PluginOptions {
    pages: PagesOptions,
    langs: LangsOptions | undefined,
    locals: object | undefined,
    options: pug.Options | undefined,
    i18nInitOptions: InitOptions,
    baseDir: string
}
/**
 * A page interface to store lang code and page path for meta map data
 * @param langCode string
 * @param page string
 */
interface MetaPage {
    langCode: string | null,
    page: string
}

/**
 * Check if provided path is directory
 * @param path string
 * @returns Promise<boolean>
 */
const isDirectory = async (path: string): Promise<boolean> => {
    const stats = await fs.promises.stat(path)
    return stats.isDirectory()
}

/**
 * Scans directory and sub-directories recursively for files with provided extension and returns it as an array
 * @param baseDir string
 * @param ext string (optional)
 * @returns Promise<Array<string>>
 */
const getFilelist = async (baseDir: string, ext = '.pug'): Promise<Array<string>> => {
    const files = await fs.promises.readdir(baseDir)
    return files
        .reduce(async (p: Promise<Array<string>> | Array<string>, i): Promise<Array<string>> => {
            p = await p
            const resolvedPath = path.resolve(baseDir, i)
            if (await isDirectory(resolvedPath)) {
                const filelist = await getFilelist(resolvedPath)
                p = p.concat(filelist)
            } else if (path.extname(resolvedPath) === ext) {
                p.push(resolvedPath)
            }
            return p
        }, [])
}

/**
 * A vite plugin to compile pugjs templates as static pages with language route and translation support
 * @param options PluginOptions
 * @returns object
 */
const vitePluginPugI18n = function ({
    pages,
    langs,
    locals,
    options,
    i18nInitOptions = {},
    baseDir = ''
}: PluginOptions) {
    const langMap = new Map<string, string>()
    const langMetaMap = new Map<string, MetaPage>()
    const pageMap = new Map<string, pug.compileTemplate>()
    let translate: (a: string) => string
    let langsFound: Array<string> = []
    let pagesFound: Array<string> = []

    let root = ''
    let basePath = ''
    let prefix = ''

    const loadLang = async (lang: string) => {
        const langCode = path.basename(lang, ".json")
        const langJson = await fs.promises.readFile(lang, "utf-8")
        langMap.set(langCode, JSON.parse(langJson))
    }
    
    const loadLangs = async (langs: LangsOptions) => {
        langsFound = await getFilelist(langs.baseDir, '.json')
        await Promise.all(langsFound.map(loadLang))
    }

    const loadPages = async () => {
        pagesFound = await getFilelist(pages.baseDir)
    }

    const getDistPath = (baseDir: string, page: string, langCode = ''): string => {
        const relativePath = path
            .relative(baseDir, page)
            .replace(/\.pug$/, ".html")
        return langCode ? path.normalize(`${basePath}/${langCode}/${relativePath}`) : path.normalize(`${basePath}/${relativePath}`)
    }

    const normalizeBase = (b: string): string => {
        return path.normalize(b).replace(/^(\/|\\)+/, '').replace(/\\+/g, '/')
    }

    const normalizeUrl = (b: string): string => {
        return path.normalize(b)
            .replace(/(\/|\\)+/g, '/')
            .replace(/:\//, '://')
            .replace(/^\/(.*):\/\//, '$1://')
    }

    const urlPrefix = (url: string): string => {
        const localBase = prefix || basePath
        return normalizeUrl(`/${localBase}/${url}`)
    }

    const getAssetFileNames = (userConfig) => {
        const assetFileNames = userConfig.rollupOptions?.output?.assetFileNames
        return assetFileNames ? normalizeBase(`${basePath}/${assetFileNames}`) : normalizeBase(`${basePath}/assets/[name]-[hash][extname]`)
    }

    const getChunkFileNames = (userConfig) => {
        const chunkFileNames = userConfig.rollupOptions?.output?.chunkFileNames
        return chunkFileNames ? normalizeBase(`${basePath}/${chunkFileNames}`) : normalizeBase(`${basePath}/assets/[name]-[hash].js`)
    }

    const processPages = () => {
        const input = {}
        // inject entry files here
        for (const page of pagesFound) {
            if (langs) {
                for (const langCode of langMap.keys()) {
                    const distPath = getDistPath(pages.baseDir, page, langCode)
                    input[distPath] = distPath
                    langMetaMap.set(distPath, {
                        langCode,
                        page
                    })
                }
            } else {
                const distPath = getDistPath(pages.baseDir, page)
                input[distPath] = distPath
                langMetaMap.set(distPath, {
                    langCode: null,
                    page
                })
            }
        }
        return input
    }

    return {
        name: "vite-plugin-pug-i18n",
        enforce: "pre",
        apply: "build",

        async config(userConfig) {
            basePath = normalizeBase(baseDir)
            prefix = userConfig.base

            if (langs) {
                await Promise.all([loadPages(), loadLangs(langs)])
            } else {
                await loadPages()
            }

            return {
                build: {
                    rollupOptions: {
                        input: processPages(),
                        output: {
                            assetFileNames: getAssetFileNames(userConfig),
                            chunkFileNames: getChunkFileNames(userConfig)
                        }
                    }
                },
                base: prefix && !baseDir ? prefix : '/'
            }
        },

        // Save root on configResolved
        configResolved(resolvedConfig) {
            root = resolvedConfig.root
        },

        // Init I18n on buildStart
        buildStart() {
            if (langs) {
                const resources = {}
                for (const [langCode, langObject] of langMap.entries()) {
                    resources[langCode] = {
                        translation: langObject
                    }
                }
            
                i18next.init({
                    fallbackLng: langs.fallbackLng || langMap.keys()[0],
                    supportedLngs: [...langMap.keys()],
                    resources,
                    ...i18nInitOptions
                })
            }
        },

        resolveId(id, importer) {
            // Resolve html files generated by pug
            if (langMetaMap.has(id)) {
                return id
            }
            // Resolve static assets in pug files
            if (importer && langMetaMap.has(importer)) {
                if (id === "vite/modulepreload-polyfill") {
                    // Ignore vite modulepreload polyfill
                    return
                }
                return path.resolve(root, id)
            }
        },

        // Transform pug to html
        async load(id) {
            const meta = langMetaMap.get(id)
            if (!meta) {
                return
            }
            const { langCode, page } = meta

            let template = pageMap.get(page)
            if (!template) {
                template = pug.compileFile(page, options)
                pageMap.set(page, template)
            }

            if (langs && langCode) {
                if (typeof langs.translate === 'function') {
                    translate = langs.translate(langCode)
                } else {
                    translate = i18next.getFixedT(langCode)
                }

                const translation = langMap.get(langCode)
    
                return template({
                    i18next,
                    __: translate,
                    lang: langCode,
                    translation,
                    base: baseDir,
                    prefix: urlPrefix,
                    ...locals
                })
            } else {
                return template({
                    base: baseDir,
                    prefix: urlPrefix,
                    ...locals
                })
            }
        }
    }
}

export default vitePluginPugI18n