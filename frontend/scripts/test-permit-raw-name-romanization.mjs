import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const dir = mkdtempSync(resolve('node_modules', '.permit-raw-romanization-'))

function compile(inputPath, outputName, replacements = []) {
  const source = readFileSync(inputPath, 'utf8')
  let output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
    fileName: inputPath,
  }).outputText
  for (const [from, to] of replacements) {
    output = output.replace(from, to)
  }
  writeFileSync(resolve(dir, outputName), output)
}

let resolveRomanization
try {
  compile(
    'src/services/officialRomanizationVariants.ts',
    'officialRomanizationVariants.mjs',
  )
  compile(
    'src/services/nameRomanization.ts',
    'nameRomanization.mjs',
    [[
      "from './officialRomanizationVariants'",
      "from './officialRomanizationVariants.mjs'",
    ]],
  )
  compile(
    'src/services/permitRawNameRomanization.ts',
    'permitRawNameRomanization.mjs',
    [[
      "from './nameRomanization'",
      "from './nameRomanization.mjs'",
    ]],
  )
  ;({ resolvePermitRawRomanization: resolveRomanization } =
    await import(pathToFileURL(
      resolve(dir, 'permitRawNameRomanization.mjs'),
    ).href))
} finally {
  rmSync(dir, { recursive: true, force: true })
}

assert.deepEqual(
  resolveRomanization('王一明', [{
    surname: 'WANG',
    givenNames: 'YI MING',
    distance: 8,
  }]),
  {
    compatibility: 'compatible',
    latinDistance: 8,
    officialVariantPromotion: false,
    conflictSubtype: null,
  },
)

assert.deepEqual(
  resolveRomanization('王一明', [{
    surname: 'WANG',
    givenNames: 'I MING',
    distance: 8,
  }]),
  {
    compatibility: 'compatible',
    latinDistance: 8,
    officialVariantPromotion: true,
    conflictSubtype: null,
  },
)

assert.deepEqual(
  resolveRomanization('王石明', [{
    surname: 'WANG',
    givenNames: 'SHIH MING',
    distance: 6,
  }]),
  {
    compatibility: 'compatible',
    latinDistance: 6,
    officialVariantPromotion: true,
    conflictSubtype: null,
  },
)

assert.deepEqual(
  resolveRomanization('王一明', [
    {
      surname: 'WANG',
      givenNames: 'I MING',
      distance: 1,
    },
    {
      surname: 'WANG',
      givenNames: 'YI MING',
      distance: 7,
    },
  ]),
  {
    compatibility: 'compatible',
    latinDistance: 7,
    officialVariantPromotion: false,
    conflictSubtype: null,
  },
)

assert.deepEqual(
  resolveRomanization('王英明', [{
    surname: 'WANG',
    givenNames: 'YIN MING',
    distance: 5,
  }]),
  {
    compatibility: 'conflict',
    latinDistance: 5,
    officialVariantPromotion: false,
    conflictSubtype: 'one-syllable-mismatch',
  },
)

assert.deepEqual(
  resolveRomanization('王一明', [{
    surname: 'WANG',
    givenNames: 'I',
    distance: 4,
  }]),
  {
    compatibility: 'conflict',
    latinDistance: 4,
    officialVariantPromotion: false,
    conflictSubtype: 'token-count-mismatch',
  },
)

assert.deepEqual(
  resolveRomanization('王英華', [{
    surname: 'WANG',
    givenNames: 'TING MING',
    distance: 5,
  }]),
  {
    compatibility: 'unknown',
    latinDistance: 5,
    officialVariantPromotion: false,
    conflictSubtype: null,
  },
)

assert.deepEqual(
  resolveRomanization('王一明', []),
  {
    compatibility: 'unknown',
    latinDistance: null,
    officialVariantPromotion: false,
    conflictSubtype: null,
  },
)

console.log('Permit raw-name BOCA romanization resolver tests passed')
