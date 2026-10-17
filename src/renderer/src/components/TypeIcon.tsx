import { AppWindow, FileArchive, FileText, Film, Image, Music, type LucideIcon } from 'lucide-react'
import { fileCategory } from '../utils/fileCategory'

const ICONS: Record<string, LucideIcon> = {
  Video: Film,
  Music: Music,
  Programs: AppWindow,
  Archives: FileArchive,
  Documents: FileText,
  Pictures: Image
}

// Made once: an element can be shown in any number of places.
const ELEMENTS = Object.fromEntries(
  Object.entries(ICONS).map(([category, Icon]) => [
    category,
    <Icon
      key={category}
      role="img"
      aria-label={category}
      className="size-3.5 shrink-0 text-muted-foreground"
      strokeWidth={1.75}
    >
      <title>{category}</title>
    </Icon>
  ])
)

/** A small icon saying what kind of file this is (video, music, app, archive…), after its name;
 * nothing for a kind it can't tell. */
export function TypeIcon({ fileName }: { fileName: string }): React.JSX.Element | null {
  const category = fileCategory(fileName)
  return (category && ELEMENTS[category]) || null
}
