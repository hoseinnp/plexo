import { expect, test } from '@playwright/test'
import {
  formatBytes,
  formatEta,
  formatPercent,
  formatSpeed,
  parseLinks,
  speedTicks
} from '../src/renderer/src/utils/format'
import { batchDir, folderName } from '../src/renderer/src/utils/fileCategory'

const GiB = 1024 ** 3
const MiB = 1024 ** 2

test.describe('formatting @smoke', () => {
  test('a percentage reads 100 only once every byte is in', () => {
    expect(formatPercent(10 * GiB - 5 * MiB, 10 * GiB)).toBe(99)
    expect(formatPercent(999, 1000)).toBe(99)
    expect(formatPercent(1000, 1000)).toBe(100)
    expect(formatPercent(994, 1000)).toBe(99)
    expect(formatPercent(500, 1000)).toBe(50)
    expect(formatPercent(0, 0)).toBe(0)
  })

  test('less than a byte a second is still in bytes', () => {
    expect(formatBytes(0.5)).toBe('1 B')
    expect(formatSpeed(1 / 3, 'bytes')).toBe('0 B/s')
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  test('a speed axis for a sub-byte speed is finite', () => {
    const { top, ticks } = speedTicks(0.5, 'bytes')
    expect(Number.isFinite(top)).toBe(true)
    expect(top).toBeGreaterThanOrEqual(0.5)
    expect(ticks.length).toBeGreaterThan(0)
    for (const tick of ticks) expect(tick.label).toMatch(/ B\/s$/)
  })

  test('a countdown never reads 60s', () => {
    expect(formatEta(0.2)).toBe('1s')
    expect(formatEta(58.2)).toBe('59s')
    expect(formatEta(59.01)).toBe('1m 0s')
    expect(formatEta(59.5)).toBe('1m 0s')
    expect(formatEta(61)).toBe('1m 1s')
  })
})

test.describe('links pasted together @smoke', () => {
  test('every link in the text, in order and once, without what is stuck to it', () => {
    const text = [
      'Season 2:',
      '1) https://cdn.example.com/s02e01.mkv,',
      '(https://cdn.example.com/s02e02.mkv)',
      '"https://cdn.example.com/s02e03.mkv"',
      'mirror https://cdn.example.com/s02e01.mkv',
      'magnet:?xt=urn:btih:abc&dn=extras.'
    ].join('\n')
    expect(parseLinks(text)).toEqual([
      'https://cdn.example.com/s02e01.mkv',
      'https://cdn.example.com/s02e02.mkv',
      'https://cdn.example.com/s02e03.mkv',
      'magnet:?xt=urn:btih:abc&dn=extras'
    ])
    expect(parseLinks('nothing here')).toEqual([])
  })

  test('a folder name is safe on every OS', () => {
    expect(folderName('  Season  2 ')).toBe('Season 2')
    expect(folderName('Game: Part 1/2?')).toBe('Game Part 1 2')
    expect(folderName('..')).toBe('')
    expect(folderName('trailing. . ')).toBe('trailing')
  })

  test('with a folder the batch stays together; without, each file is sorted on its own', () => {
    const at = (fileName: string, folder: string, sort: boolean): string =>
      batchDir('/d', fileName, { folder, sort, first: 'game.part1.rar', separator: '/' })
    expect(at('setup.exe', 'Game', true)).toBe('/d/Archives/Game')
    expect(at('setup.exe', 'Game', false)).toBe('/d/Game')
    expect(at('setup.exe', '', true)).toBe('/d/Programs')
    expect(at('setup.exe', '', false)).toBe('/d')
  })
})
