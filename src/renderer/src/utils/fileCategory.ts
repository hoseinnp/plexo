// Subfolders a web download is sorted into by its extension, as FDM does. Anything else stays in
// the folder picked.
const CATEGORIES: Record<string, string[]> = {
  Video: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg', 'ts', '3gp'],
  Music: ['mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a', 'wma', 'opus'],
  Programs: ['exe', 'msi', 'msix', 'appx', 'apk', 'dmg', 'pkg', 'deb', 'rpm', 'appimage'],
  Archives: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'zst', 'iso'],
  Documents: [
    'pdf',
    'doc',
    'docx',
    'xls',
    'xlsx',
    'ppt',
    'pptx',
    'txt',
    'rtf',
    'odt',
    'ods',
    'csv',
    'epub'
  ],
  Pictures: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'tif', 'tiff']
}

const BY_EXTENSION = new Map(
  Object.entries(CATEGORIES).flatMap(([folder, extensions]) =>
    extensions.map((extension) => [extension, folder] as const)
  )
)

/** The subfolder `fileName` goes into, if it has one. */
export function fileCategory(fileName: string): string | undefined {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? BY_EXTENSION.get(fileName.slice(dot + 1).toLowerCase()) : undefined
}

/** `dir` with `fileName`'s subfolder added, unless it has none or `dir` already is that folder. */
export function sortedDir(dir: string, fileName: string, separator: string): string {
  const folder = fileCategory(fileName)
  const last = dir.split(/[\\/]/).filter(Boolean).pop()
  if (!folder || last?.toLowerCase() === folder.toLowerCase()) return dir
  return `${dir.replace(/[\\/]+$/, '')}${separator}${folder}`
}
