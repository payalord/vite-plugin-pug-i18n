import path from "path"
import fs from "fs"
import pug from "pug"
import i18next, { InitOptions } from "i18next"
import { Plugin } from "vite"
import { PluginContext } from "rollup"

/**
 * Page type is object as {slug: locals, template: '/templates/article.pug'} => {'/article-1': {content: 'The is an article content here in the body', title: 'Cool Article', keywords: '', meta: {}, footerContent: ''}}
 */
interface Page {
    slug: string,
    template: string | undefined,
    content: string | object | Array<object>
}

type DynamicResolve = (pages: Array<Page> | Page) => void
type DynamicNext = (index: number) => void
type DynamicPages = (index: number, resolve: DynamicResolve, next: DynamicNext) => void | Promise<void>

/**
 * Pages options
 * @param baseDir string
 */
interface PagesOptions {
    baseDir: string,
    templateDir: string | undefined,
    dynamicPages: DynamicPages | Array<Page> | Page | false | undefined
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
const vitePluginPugI18n = function (this: PluginContext, {
    pages,
    langs,
    locals,
    options,
    i18nInitOptions = {},
    baseDir = ''
}: PluginOptions): Plugin {
    const context = this
    const langMap = new Map<string, string>()
    const langMetaMap = new Map<string, MetaPage>()
    const pageMap = new Map<string, pug.compileTemplate>()
    const dynamicPageMap = new Map<string, Page>()
    let translate: (a: string) => string
    let langsFound: Array<string> = []
    let pagesFound: Array<string> = []

    let root: string = ''
    let basePath: string = ''
    let prefix: string | undefined = ''
    let batchIndex: number = 0
    let continueFetching: boolean = true

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
        const assetFileNames = userConfig.build?.rollupOptions?.output?.assetFileNames
        return assetFileNames ? normalizeBase(`${basePath}/${assetFileNames}`) : normalizeBase(`${basePath}/assets/[name]-[hash][extname]`)
    }

    const getChunkFileNames = (userConfig) => {
        const chunkFileNames = userConfig.build?.rollupOptions?.output?.chunkFileNames
        return chunkFileNames ? normalizeBase(`${basePath}/${chunkFileNames}`) : normalizeBase(`${basePath}/[name]-[hash].js`)
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

    const getTemplatePath = (page: Page): string => {
        if (page.template) {
            const ext = path.extname(page.template)
            page.template = ext === '' || ext === '.' ? `${page.template}.pug` : page.template
            return path.resolve(root, pages.templateDir || 'src/templates', page.template)
        }
        return path.resolve(root, pages.templateDir || 'src/templates', 'default.pug')
    }

    const getDynamicLocals = (langCode: string, page: Page): object => {
        if (page.content instanceof Array) {
            return page.content[batchIndex]
        }
        return page.content
    }

    const dynamicResolve: DynamicResolve = (pages: Array<Page> | Page) => {
        if (continueFetching) {
            if (pages instanceof Array) {
                pages.forEach((page, index) => {
                    dynamicPageMap.set(`dynamic-data:${index}`, page)
                    if (langs) {
                        for (const langCode of langMap.keys()) {
                            langMetaMap.set(`dynamic-data:${index}:${langCode}`, {
                                langCode: langCode,
                                page: `dynamic-data:${index}`
                            })
                        }
                    } else {
                        langMetaMap.set(`dynamic-data:${index}`, {
                            langCode: null,
                            page: `dynamic-data:${index}`
                        })
                    }
                })
            } else {
                const index = dynamicPageMap.size
                dynamicPageMap.set(`dynamic-data:${index}`, pages)
                if (langs) {
                    for (const langCode of langMap.keys()) {
                        langMetaMap.set(`dynamic-data:${index}:${langCode}`, {
                            langCode: langCode,
                            page: `dynamic-data:${index}`
                        })
                    }
                } else {
                    langMetaMap.set(`dynamic-data:${index}`, {
                        langCode: null,
                        page: `dynamic-data:${index}`
                    })
                }
            }
        }
    }

    const dynamicNext: DynamicNext = (index: number | undefined) => {
        batchIndex = index || batchIndex
        dynamicPageMap.forEach((page, id) => {
            for (const langCode of langMap.keys()) {1
                const distPath = getDistPath(pages.baseDir, `${page.slug}.pug`, langCode)
                this.emitFile({
                    type: "chunk",
                    id: `${id}:${langCode}`,
                    fileName: `${distPath}`
                })
            }
        })
        batchIndex++
        continueFetching = true
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

        async resolveDynamicImport(specifier, importer) {
            // Resolve dynamic imports for the remaining items
            if (specifier === 'dynamic-data:load' && continueFetching) {
                return {
                    id: 'dynamic-data:load',
                }
            }
        },

        // Transform pug to html
        async load(id) {
            if (pages.dynamicPages instanceof Function && continueFetching) {
                continueFetching = false
                pages.dynamicPages(batchIndex, dynamicResolve, dynamicNext)
            }

            if (id.startsWith('dynamic-data:') && langMetaMap.has(id)) {
                const meta = langMetaMap.get(id)
                if (!meta) {
                    return
                }

                const { langCode, page: pageDynamicId } = meta
                const page = dynamicPageMap.get(pageDynamicId)

                if (!page) {
                    return
                }

                let template = pageMap.get(id)
                if (!template) {
                    const templateFilePath = getTemplatePath(page)
                    const locals = getDynamicLocals(langCode || 'en', page.content)
                    template = pug.compileFile(getDynamicTemplate(templateFilePath), options)
                    pageMap.set(id, template)
                }
            }

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
