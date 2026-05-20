<script lang="ts">
  import Modal from './Modal.svelte'

  interface Props {
    open: boolean
    message: string
    confirmLabel?: string
    cancelLabel?: string
    /** Use destructive (red) styling for the confirm button */
    danger?: boolean
    onConfirm: () => void
    onCancel: () => void
  }

  let {
    open,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    danger = false,
    onConfirm,
    onCancel
  }: Props = $props()
</script>

<Modal {open} title="Confirm" onclose={onCancel} size="sm">
  <p class="text-slate-700 dark:text-slate-300">{message}</p>

  {#snippet footer()}
    <div class="flex justify-end gap-3">
      <button class="btn-secondary" onclick={onCancel}>{cancelLabel}</button>
      <button
        class="btn-primary {danger ? 'bg-red-600 hover:bg-red-700 focus:ring-red-500' : ''}"
        onclick={onConfirm}
      >{confirmLabel}</button>
    </div>
  {/snippet}
</Modal>
