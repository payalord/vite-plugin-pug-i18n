[![npm](https://img.shields.io/npm/v/vite-plugin-pug-i18n.svg)](https://www.npmjs.com/package/vite-plugin-pug-i18n) [![GitHub license](https://img.shields.io/badge/license-MIT-green.svg)](https://raw.githubusercontent.com/payalord/vite-plugin-pug-i18n/master/LICENSE)

# Vite Plugin Pug I18n

A vite plugin with support of rendering multiple pages based on [pugjs](https://pugjs.org/) templates. Plugin also support i18n with proper directory route structure creation.

## Installation
```bash
npm i -D vite-plugin-pug-i18n
```

## Plugin Options
Plugin Options is an object that expect's next properties:
* pages - pages options.
    * baseDir - resolved path to pages directory.
* langs - (Optional) language options.
    * baseDir - resolved path to langs directory.
    * translate - a init function to provide translate function back. As an input this function will receive lang code.
    * fallbackLng - i18next fallback language option.
* locals - pug locals.
* options - pug options.
* i18nInitOptions - init options for i18next.
* baseDir - base directory to put all the output files within.

Note: `__` and `lang` are reserved locals. First is translation function that will be provided to pug, second is current language code. This locals are not provided if `langs` option are null or undefined.

## Usage example

You can start with vite javascript template project. And just modify it.

Let's assume you have your pug pages files in `src/pages` directory of your project:
```bash
src/pages/index.pug
src/pages/test-route/test-page.pug
```

While language `.json` files are located in `src/language`. With 2 language available there - `en` and `fr`:
```bash
src/language/en.json
src/language/fr.json
```

Then you'll need to provide next options to the plugin:
```javascript
// vite.config.js

import { defineConfig } from 'vite'
import { resolve } from 'path'
import vitePluginPugI18n from 'vite-plugin-pug-i18n'

export default defineConfig({
    resolve: {
        alias: {
            '@': resolve(__dirname, './src')
        }
    },
    plugins: [
        vitePluginPugI18n({
            pages: {
                baseDir: resolve(__dirname, 'src/pages')
            },
            langs: {
                baseDir: resolve(__dirname, 'src/language')
            }
        })
    ]
})
```

That will generate next static html files structure on build for you in `dist`:
```bash
dist/en/index.html
dist/en/test-route/test-page.html
dist/fr/index.html
dist/fr/test-route/test-page.html
```

In case if `langs` option will not be provided or will be `null`, then static html pages will be generated without language support:
```bash
dist/index.html
dist/test-route/test-page.html
```

## Root redirect to language version

There is no `index.html` in `dist` when the language mode is used. You can create it manually in vite's `public` directory, which will then be copied to `dist` during build. And add some redirect custom code to it. So it's up to developer which mechanism to use to detect user's language on client side(or server) and auto-redirect to proper url after.

Root `index.html` example:
```html
<html>
<body>
<script>
    window.location="/en";
</script>
</body>
</html>
```

## i18next

Plugin is using i18next as a translation function. Language filename must have next format `[language-code].json`, and the file structure is:

`en.json`
```json
{
    "hello": "Hello!"
}
```

So it is key/value json format. So in pug template you can use it like this:
```pug
// index.pug
p #{__('hello')}
```

## Javascript files

You can use `*.js` files in pug that will be processed as vite assets and properly replaced, example:
```pug
// index.pug
p #{__('hello')}
script(type='module', src='@/main.js')
```

Where `main.js` is normal ESMAScript that will be compiled by vite as asset. Within which you can import any `sass`, `scss`, `css` files.

**NOTE:** Since vite 5.0.0 or 6.0.0 path resolution for `src` and similar attributes changed. Previously it was based on the root of the project. Now it is based on current compiled html file location in dist, which is wrong in our case and will break the build when in language mode. So to avoid this issue you need to use resolve alias with `@` symbol (please check vite config for how to setup resolve alias).

## Exposed PUG locals

You still can manually provide `locals` to pug with or without `langs` option. But keep in mind that plugin reserved some exposed locals listed here, which can be overriden by your locals.

Default locals exposed to pug:
* base - plugin's baseDir value from configuration.
* prefix - function to prefix properly website URLs.

In a translation mode (when `langs` option provided) next additional locals exposed to pug:
* i18next - plugin's working instance of i18next in case if it will be required to use it.
* __ - translation function.
* lang - current lang code.
* translation - current language translation json object.

## URL Prefix
To prefix assets or any urls on your pages, you can provide vite's `base` shared configuration option. Exposed `prefix` function will use it to properly generate urls in pug. Another option is instead of using `base`, to use plugin's `baseDir` option. With this option vite will generate and output all the files within the `dist` + `baseDir` directory. While exposed `prefix` function will then properly prefix all the urls according to `baseDir` value.

Another words `prefix` function works with both vite's `base` option and plugin's `baseDir`.

## License

[MIT License](LICENSE)
