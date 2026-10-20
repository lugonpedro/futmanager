import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { buttonVariants } from '@/components/ui/button'
import { answerConfirm, useConfirmStore } from '../confirm.ts'

/** The one modal every confirm() question shows in. */
export function ConfirmHost() {
  const pending = useConfirmStore((s) => s.pending)
  const [remember, setRemember] = useState(false)
  const close = (ok: boolean) => {
    answerConfirm(ok, remember)
    setRemember(false)
  }
  return (
    <AlertDialog open={pending !== undefined} onOpenChange={(open) => !open && close(false)}>
      {pending && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending.title}</AlertDialogTitle>
            <AlertDialogDescription>{pending.description}</AlertDialogDescription>
          </AlertDialogHeader>
          {pending.rememberKey && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Não perguntar de novo
            </label>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => close(false)}>
              {pending.cancel ?? 'Cancelar'}
            </AlertDialogCancel>
            <AlertDialogAction
              className={pending.destructive ? buttonVariants({ variant: 'destructive' }) : ''}
              onClick={() => close(true)}
            >
              {pending.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  )
}
