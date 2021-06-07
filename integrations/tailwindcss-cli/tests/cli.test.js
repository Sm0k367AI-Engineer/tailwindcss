let path = require('path')
let $ = require('../../execute')
let { css, html } = require('../../syntax')
let resolveToolRoot = require('../../resolve-tool-root')

let { readOutputFile, writeInputFile, cleanupFile, fileExists, removeFile } = require('../../io')({
  output: 'dist',
  input: 'src',
})

let EXECUTABLE = 'node ../../lib/cli.js'

describe('Build command', () => {
  test('--output', async () => {
    await writeInputFile('index.html', html`<div class="font-bold"></div>`)

    await $(`${EXECUTABLE} --output ./dist/main.css`)

    let contents = await readOutputFile('main.css')

    // `-i` is omitted, therefore the default `@tailwind base; @tailwind
    // components; @tailwind utilities` is used. However `preflight` is
    // disabled. I still want to verify that the `base` got included.
    expect(contents).toIncludeCss(
      css`
        *,
        ::before,
        ::after {
          --tw-border-opacity: 1;
          border-color: rgba(229, 231, 235, var(--tw-border-opacity));
        }
      `
    )

    // Verify `utilities` output is correct
    expect(contents).toIncludeCss(
      css`
        .font-bold {
          font-weight: 700;
        }
      `
    )
  })

  test('--input, --output', async () => {
    await writeInputFile('index.html', html`<div class="font-bold"></div>`)

    await $(`${EXECUTABLE} --input ./src/index.css --output ./dist/main.css`)

    expect(await readOutputFile('main.css')).toIncludeCss(
      css`
        .font-bold {
          font-weight: 700;
        }
      `
    )
  })

  test('--minify', async () => {
    await writeInputFile('index.html', html`<div class="font-bold"></div>`)

    await $(`${EXECUTABLE} --output ./dist/main.css --minify`)
    let withMinify = await readOutputFile('main.css')

    // Verify that we got the expected output. Note: `.toIncludeCss` formats
    // `actual` & `expected`
    expect(withMinify).toIncludeCss(
      css`
        .font-bold {
          font-weight: 700;
        }
      `
    )

    await $(`${EXECUTABLE} --output ./dist/main.css`)
    let withoutMinify = await readOutputFile('main.css')

    // Let's verify that the actual minified output is smaller than the not
    // minified version.
    expect(withoutMinify.length).toBeGreaterThan(withMinify.length)
  })

  test('--no-autoprefixer', async () => {
    await writeInputFile('index.html', html`<div class="select-none"></div>`)

    await $(`${EXECUTABLE} --output ./dist/main.css`)
    let withAutoprefixer = await readOutputFile('main.css')

    expect(withAutoprefixer).toIncludeCss(css`
      .select-none {
        -webkit-user-select: none;
        user-select: none;
      }
    `)

    await $(`${EXECUTABLE} --output ./dist/main.css --no-autoprefixer`)
    let withoutAutoprefixer = await readOutputFile('main.css')

    expect(withoutAutoprefixer).toIncludeCss(css`
      .select-none {
        user-select: none;
      }
    `)
  })

  test('--config (non-existing config file)', async () => {
    await writeInputFile('index.html', html`<div class="font-bold"></div>`)

    let { stderr } = await $(
      `${EXECUTABLE} --output ./dist/main.css --config ./non-existing.config.js`
    ).catch((err) => err)

    let toolRoot = resolveToolRoot()
    expect(stderr).toEqual(
      `Specified config file ${path.resolve(toolRoot, 'non-existing.config.js')} does not exist.\n`
    )
  })

  test('--config (existing config file)', async () => {
    await writeInputFile('index.html', html`<div class="font-bold"></div>`)

    let customConfig = `module.exports = ${JSON.stringify(
      {
        purge: ['./src/index.html'],
        mode: 'jit',
        darkMode: false, // or 'media' or 'class'
        theme: {
          extend: {
            fontWeight: {
              bold: 'BOLD',
            },
          },
        },
        variants: {
          extend: {},
        },
        corePlugins: {
          preflight: false,
        },
        plugins: [],
      },

      null,
      2
    )}`

    await writeInputFile('../custom.config.js', customConfig)

    await $(`${EXECUTABLE} --output ./dist/main.css --config ./custom.config.js`)

    expect(await readOutputFile('main.css')).toIncludeCss(
      css`
        .font-bold {
          font-weight: BOLD;
        }
      `
    )
  })

  test('--help', async () => {
    let { combined } = await $(`${EXECUTABLE} --help`)

    expect(combined).toMatchInlineSnapshot(`
      "
      tailwindcss v2.1.2

      Usage:
         tailwindcss build [options]

      Options:
         -i, --input              Input file
         -o, --output             Output file
         -w, --watch              Watch for changes and rebuild as needed
             --jit                Build using JIT mode
             --files              Template files to scan for class names
             --postcss            Load custom PostCSS configuration
         -m, --minify             Minify the output
         -c, --config             Path to a custom config file
             --no-autoprefixer    Disable autoprefixer
         -h, --help               Display usage information

      "
    `)
  })
})

describe('Init command', () => {
  test('--full', async () => {
    cleanupFile('full.config.js')

    let { combined } = await $(`${EXECUTABLE} init full.config.js --full`)

    expect(combined).toMatchInlineSnapshot(`
      "
      Created Tailwind CSS config file: full.config.js
      "
    `)

    // Not a clean way to test this. We could require the file and verify that
    // multiple keys in `theme` exists. However it loads `tailwindcss/colors`
    // which doesn't exists in this context.
    expect((await readOutputFile('../full.config.js')).split('\n').length).toBeGreaterThan(50)
  })

  test('--jit', async () => {
    cleanupFile('with-jit.config.js')

    let { combined } = await $(`${EXECUTABLE} init with-jit.config.js --jit`)

    expect(combined).toMatchInlineSnapshot(`
      "
      Created Tailwind CSS config file: with-jit.config.js
      "
    `)

    expect(await readOutputFile('../with-jit.config.js')).toContain("mode: 'jit'")
  })

  test('--full, --jit', async () => {
    cleanupFile('full-with-jit.config.js')

    let { combined } = await $(`${EXECUTABLE} init full-with-jit.config.js --jit --full`)

    expect(combined).toMatchInlineSnapshot(`
      "
      Created Tailwind CSS config file: full-with-jit.config.js
      "
    `)

    expect(await readOutputFile('../full-with-jit.config.js')).toContain("mode: 'jit'")
  })

  test('--postcss', async () => {
    expect(await fileExists('postcss.config.js')).toBe(true)
    await removeFile('postcss.config.js')
    expect(await fileExists('postcss.config.js')).toBe(false)

    let { combined } = await $(`${EXECUTABLE} init --postcss`)

    expect(await fileExists('postcss.config.js')).toBe(true)

    expect(combined).toMatchInlineSnapshot(`
      "
      tailwind.config.js already exists.
      Created PostCSS config file: postcss.config.js
      "
    `)
  })

  test('--help', async () => {
    let { combined } = await $(`${EXECUTABLE} init --help`)

    expect(combined).toMatchInlineSnapshot(`
      "
      tailwindcss v2.1.2

      Usage:
         tailwindcss init [options]

      Options:
             --jit                Initialize for JIT mode
         -f, --full               Initialize a full \`tailwind.config.js\` file
         -p, --postcss            Initialize a \`postcss.config.js\` file
         -h, --help               Display usage information

      "
    `)
  })
})