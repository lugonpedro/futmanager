import { describe, expect, it } from 'vitest'
import { generateWorld } from '../generate/world.ts'
import { packToCsv, packToJson, parseCsv, parsePackFile } from './file.ts'
import { packFromWorld, type DataPack } from './pack.ts'

const sample: DataPack = {
  name: 'Brasileirão de mentira',
  clubs: [
    {
      name: 'Rubro-Negro; Carioca',
      shortName: 'RNC',
      city: 'Rio',
      colors: { primary: '#c8102e', secondary: '#000000' },
      players: [
        { name: 'Goleiro "Paredão"', position: 'G', age: 30, overall: 80 },
        { position: 'Z' },
        { name: 'Zagueiro Dois', position: 'Z' },
        { position: 'A' },
      ],
    },
    {},
    { name: 'Cruzmaltino', players: [{ name: 'Atacante', position: 'A' }] },
  ],
}

/** The sample as it comes back: trailing empty players are dropped. */
const trimmed: DataPack = {
  ...sample,
  clubs: [
    { ...sample.clubs[0], players: sample.clubs[0].players!.slice(0, 3) },
    {},
    sample.clubs[2],
  ],
}

describe('pack files', () => {
  it('round-trips through JSON', () => {
    const { pack, warnings } = parsePackFile(packToJson(sample), 'x.json')
    expect(pack).toEqual(trimmed)
    expect(warnings).toEqual([])
  })

  it('round-trips through CSV', () => {
    const { pack, warnings } = parsePackFile(packToCsv(sample), 'Brasileirão de mentira.csv')
    expect(pack).toEqual(trimmed)
    expect(warnings).toEqual([])
  })

  it('round-trips a whole world', () => {
    const pack = packFromWorld(generateWorld(4), 'mundo')
    expect(parsePackFile(packToJson(pack), 'a.json').pack).toEqual(pack)
    expect(parsePackFile(packToCsv(pack), 'mundo.csv').pack).toEqual(pack)
  })

  it('reads a hand-made spreadsheet with commas, aliases and accents', () => {
    const csv = [
      'Time,Sigla,Cor principal,Cor secundária,Nome,Posição,Idade',
      'Alvinegro,alv,#000,#fff,Fulano,GOL,25',
      ',,,,Beltrano,zag,',
      'Tricolor,,,,Ciclano,volante,',
      'Alvinegro,,,,Outro,ATA,',
    ].join('\n')
    const { pack, warnings } = parsePackFile(csv, 'meu.csv')
    expect(warnings).toEqual([])
    expect(pack.name).toBe('meu')
    expect(pack.clubs).toEqual([
      {
        name: 'Alvinegro',
        shortName: 'ALV',
        colors: { primary: '#000000', secondary: '#ffffff' },
        players: [
          { name: 'Fulano', position: 'G', age: 25 },
          { name: 'Beltrano', position: 'Z' },
          { name: 'Outro', position: 'A' },
        ],
      },
      { name: 'Tricolor', players: [{ name: 'Ciclano', position: 'M' }] },
    ])
  })

  it('warns about bad values and images, keeping the rest', () => {
    const json = JSON.stringify({
      formato: 'futmanager-pacote',
      versao: 1,
      nome: 'P',
      clubes: [
        {
          nome: 'A',
          sigla: 'X',
          cores: ['vermelho', '#000000'],
          escudo: 'data:image/png;base64,AAAA',
          jogadores: [{ nome: 'J', posicao: 'Q', idade: 80, overall: 120 }],
        },
      ],
    })
    const { pack, warnings } = parsePackFile(json, 'p.json')
    expect(pack.clubs).toEqual([{ name: 'A', players: [{ name: 'J' }] }])
    expect(warnings).toHaveLength(6)
    expect(warnings.at(-1)).toMatch(/Escudos/)
  })

  it('cleans up names and refuses files that are not packs', () => {
    const long = 'Nome '.repeat(20)
    const json = JSON.stringify({ formato: 'futmanager-pacote', clubes: [{ nome: `  ${long}\n` }] })
    expect(parsePackFile(json, 'p.json').pack.clubs[0].name).toHaveLength(40)
    expect(() => parsePackFile('{"formato":"outra-coisa"}', 'p.json')).toThrow(/não é um pacote/)
    expect(() => parsePackFile('nada aqui', 'p.csv')).toThrow(/cabeçalho/)
    expect(() => parsePackFile('clube;jogador\n', 'p.csv')).toThrow(/nenhum clube/)
  })

  it('splits CSV cells with quotes and line breaks', () => {
    expect(parseCsv('a;b\r\n"x;1";"di""z"\n"linha\nnova";\n')).toEqual([
      ['a', 'b'],
      ['x;1', 'di"z'],
      ['linha\nnova', ''],
    ])
  })
})
