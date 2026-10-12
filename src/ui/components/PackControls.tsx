import { UploadIcon } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Club } from '../../engine/model/types.ts'
import { parsePackFile, type ParsedPack } from '../../engine/pack/file.ts'
import { cleanShortName, PACK_LIMITS, type PackClub } from '../../engine/pack/pack.ts'

/** A button that reads a pack from a .json or .csv file the player picks. */
export function PackFileButton(props: {
  onLoad: (parsed: ParsedPack) => void
  onError: (message: string) => void
  children?: ReactNode
  variant?: 'default' | 'outline' | 'secondary'
  size?: 'default' | 'sm'
}) {
  const input = useRef<HTMLInputElement>(null)
  const read = async (file: File | undefined) => {
    if (!file) return
    try {
      props.onLoad(parsePackFile(await file.text(), file.name))
    } catch (error) {
      props.onError(error instanceof Error ? error.message : String(error))
    } finally {
      if (input.current) input.current.value = ''
    }
  }
  return (
    <>
      <Button
        variant={props.variant ?? 'outline'}
        size={props.size}
        onClick={() => input.current?.click()}
      >
        <UploadIcon />
        {props.children ?? 'Importar pacote'}
      </Button>
      <input
        ref={input}
        type="file"
        accept=".json,.csv,application/json,text/csv"
        className="hidden"
        onChange={(event) => read(event.target.files?.[0])}
      />
    </>
  )
}

const SHOWN_WARNINGS = 5

/** What came of an import: an error, or the notes about values that were left out. */
export function PackMessage(props: { message?: string; warnings?: string[] }) {
  const warnings = props.warnings ?? []
  if (!props.message && warnings.length === 0) return null
  return (
    <div role="status" className="flex flex-col gap-1 text-sm">
      {props.message && <p>{props.message}</p>}
      {warnings.length > 0 && (
        <ul className="list-disc pl-5 text-xs text-muted-foreground">
          {warnings.slice(0, SHOWN_WARNINGS).map((warning, i) => (
            <li key={i}>{warning}</li>
          ))}
          {warnings.length > SHOWN_WARNINGS && (
            <li>e mais {warnings.length - SHOWN_WARNINGS} aviso(s).</li>
          )}
        </ul>
      )}
    </div>
  )
}

export type ClubFields = Pick<PackClub, 'name' | 'shortName' | 'city' | 'colors'>

/**
 * Name, short name, city and colours of a club. Empty fields show the club's
 * current value in grey and leave it as it is.
 */
export function ClubFieldsForm(props: {
  value: ClubFields
  base: Club
  onChange: (value: ClubFields) => void
}) {
  const { value, base } = props
  const set = (fields: Partial<ClubFields>) => props.onChange({ ...value, ...fields })
  const text = (raw: string) => (raw.trim() ? raw.slice(0, PACK_LIMITS.name) : undefined)
  const colors = value.colors ?? base.colors
  const id = `clube-${base.id}`
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Nome" htmlFor={`${id}-nome`} className="sm:col-span-2">
        <Input
          id={`${id}-nome`}
          value={value.name ?? ''}
          placeholder={base.name}
          maxLength={PACK_LIMITS.name}
          onChange={(e) => set({ name: text(e.target.value) })}
        />
      </Field>
      <Field label="Sigla" htmlFor={`${id}-sigla`}>
        <Input
          id={`${id}-sigla`}
          value={value.shortName ?? ''}
          placeholder={base.shortName}
          onChange={(e) => set({ shortName: cleanShortName(e.target.value) || undefined })}
        />
      </Field>
      <Field label="Cidade" htmlFor={`${id}-cidade`}>
        <Input
          id={`${id}-cidade`}
          value={value.city ?? ''}
          placeholder={base.city}
          maxLength={PACK_LIMITS.name}
          onChange={(e) => set({ city: text(e.target.value) })}
        />
      </Field>
      <Field label="Cores" htmlFor={`${id}-cor1`}>
        <div className="flex items-center gap-2">
          <input
            id={`${id}-cor1`}
            type="color"
            aria-label="Cor principal"
            className="h-9 w-12 cursor-pointer rounded-md border bg-transparent p-1"
            value={colors.primary}
            onChange={(e) => set({ colors: { ...colors, primary: e.target.value } })}
          />
          <input
            type="color"
            aria-label="Cor secundária"
            className="h-9 w-12 cursor-pointer rounded-md border bg-transparent p-1"
            value={colors.secondary}
            onChange={(e) => set({ colors: { ...colors, secondary: e.target.value } })}
          />
          {value.colors && (
            <Button variant="ghost" size="sm" onClick={() => set({ colors: undefined })}>
              Voltar às cores de antes
            </Button>
          )}
        </div>
      </Field>
    </div>
  )
}

function Field(props: { label: string; htmlFor: string; className?: string; children: ReactNode }) {
  return (
    <div className={`flex flex-col gap-1.5 ${props.className ?? ''}`}>
      <Label htmlFor={props.htmlFor}>{props.label}</Label>
      {props.children}
    </div>
  )
}

/** The reminder that names stay on the device, with the way to the legal notice. */
export function PackLegalNote() {
  return (
    <p className="text-xs text-muted-foreground">
      Os nomes que você coloca ficam só neste navegador e são responsabilidade de quem os inseriu. O
      jogo não aceita escudos nem imagens. Veja o{' '}
      <Link to="/aviso-legal" className="underline underline-offset-2">
        aviso legal
      </Link>
      .
    </p>
  )
}
