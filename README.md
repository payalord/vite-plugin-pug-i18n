# Vite Plugin Pug I18n

A vite plugin with support of rendering multiple pages based on pugjs templates. Plugin also support i18n with proper directory route structure creation.

## Installation
```bash
npm i -D vite-plugin-pug-i18n
```

## Plugin Options
Plugin Options is an object that expect's next properties:
* pages - pages options
    * baseDir - resolved path to pages directory
* langs - (Optional) language options
    * baseDir - resolved path to langs directory
    * translate - a init function to provide translate function back. As an input this function will receive lang code
    * fallbackLng - i18next fallback language option
* locals - pug locals
* options - pug options

Note: `__` and `lang` are reserved locals. First is translation function that will be provided to pug, second is current language code. This locals are not provided if `langs` option are null or undefined.

## Usage example

Let's assume you have your pug pages files in `src/pages` directory of your project. While language `.json` files are located in `src/language`. With 2 language available there - `en` and `fr`. Then you'll need to provide next options to the plugin:

```javascript
// vite.config.js

import { defineConfig } from 'vite'
import { resolve } from 'path'
import vitePluginPugI18n from 'vite-plugin-pug-i18n'

export default defineConfig({
    plugins: [
        vitePluginPugI18n({
            pages: {
                baseDir: resolve(__dirname, 'src/pages')
            },
            langs: {
                baseDir: resolve(__dirname, 'src/language')
            },
            locals: {},
            options: {},
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

You still can manually provide `locals` to pug with or without `langs` option. But keep in mind that plugin reserved translation function name `__`(two underscores) in pug locals (that is how proper translation function is passed to pug), which can be overriden by your locals. Same true for reserved propert name `lang`.

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
script(type='module', src='src/main.js')
```

Where `main.js` is normal ESMAScript that will be compiled by vite as asset. Within which you can import any `sass`, `scss`, `css` files.

## Exposed PUG locals

In a translation mode next locals exposed to pug:
* i18next - plugin's working instance of i18next in case if it will be required to use it.
* __ - translation function.
* lang - current lang code.
* translation - current language translation json object.

## License

[MIT License](LICENSE)