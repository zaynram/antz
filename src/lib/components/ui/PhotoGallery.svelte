<script lang="ts">
  import { uploadFileToDrive } from '$lib/drive'
  import { hapticLight } from '$lib/haptics'
  import { Image as ImageIcon, Loader2, Upload, X } from 'lucide-svelte'
  import { toast } from 'svelte-sonner'

  interface Props {
    photos?: string[]
    folderPath: string[] // e.g. ['places', 'place-123']
    onUpdate: (photos: string[]) => Promise<void>
    maxPhotos?: number
  }

  let { photos = [], folderPath, onUpdate, maxPhotos = 20 }: Props = $props()

  let fileInput = $state<HTMLInputElement>()
  let uploading = $state(false)
  let selectedPhotoIndex = $state<number | null>(null)

  async function handleFileSelect(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement
    const files = input.files
    if (!files || files.length === 0) return

    const file = files[0]

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      return
    }

    // Validate file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be smaller than 10MB')
      return
    }

    // Check max photos
    if (photos.length >= maxPhotos) {
      toast.error(`Maximum ${maxPhotos} photos allowed`)
      return
    }

    uploading = true
    hapticLight()

    try {
      // Generate a unique filename
      const timestamp = Date.now()
      const extension = file.name.split('.').pop() || 'jpg'
      const filename = `photo-${timestamp}.${extension}`

      // Upload to Drive
      const result = await uploadFileToDrive(file, folderPath, filename)

      // Update the photos array
      const updatedPhotos = [...photos, result.webContentLink]
      await onUpdate(updatedPhotos)

      toast.success('Photo uploaded')
    } catch (error) {
      console.error('Failed to upload photo:', error)
      toast.error('Failed to upload photo')
    } finally {
      uploading = false
      // Reset the input
      input.value = ''
    }
  }

  async function removePhoto(_photoUrl: string, index: number): Promise<void> {
    if (!confirm('Remove this photo?')) return

    hapticLight()

    try {
      // Extract filename from URL (we can't delete by file ID with current implementation)
      // Just remove from the array

      // Remove from photos array
      const updatedPhotos = photos.filter((_, i) => i !== index)
      await onUpdate(updatedPhotos)

      toast.success('Photo removed')
    } catch (error) {
      console.error('Failed to remove photo:', error)
      toast.error('Failed to remove photo')
    }
  }

  function openLightbox(index: number): void {
    selectedPhotoIndex = index
  }

  function closeLightbox(): void {
    selectedPhotoIndex = null
  }

  function nextPhoto(): void {
    if (selectedPhotoIndex === null) return
    selectedPhotoIndex = (selectedPhotoIndex + 1) % photos.length
  }

  function previousPhoto(): void {
    if (selectedPhotoIndex === null) return
    selectedPhotoIndex = (selectedPhotoIndex - 1 + photos.length) % photos.length
  }

  function handleKeydown(e: KeyboardEvent): void {
    if (selectedPhotoIndex === null) return

    if (e.key === 'Escape') {
      closeLightbox()
    } else if (e.key === 'ArrowRight') {
      nextPhoto()
    } else if (e.key === 'ArrowLeft') {
      previousPhoto()
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-3">
  <!-- Upload button -->
  <div>
    <input
      bind:this={fileInput}
      type="file"
      accept="image/*"
      class="hidden"
      onchange={handleFileSelect}
      disabled={uploading}
    />

    <button
      type="button"
      class="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors touch-manipulation disabled:opacity-50"
      onclick={() => fileInput?.click()}
      disabled={uploading || photos.length >= maxPhotos}
    >
      {#if uploading}
        <Loader2 size={18} class="animate-spin" />
        <span class="text-sm font-medium">Uploading...</span>
      {:else}
        <Upload size={18} />
        <span class="text-sm font-medium">
          {photos.length === 0 ? 'Add Photos' : `Add Photo (${photos.length}/${maxPhotos})`}
        </span>
      {/if}
    </button>
  </div>

  <!-- Photo grid -->
  {#if photos.length > 0}
    <div class="grid grid-cols-3 gap-2">
      {#each photos as photo, index (photo)}
        <div class="relative aspect-square group">
          <button
            type="button"
            class="w-full h-full rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-800"
            onclick={() => openLightbox(index)}
          >
            <img
              src={photo}
              alt="Photo {index + 1}"
              class="w-full h-full object-cover"
              loading="lazy"
            />
          </button>

          <button
            type="button"
            class="absolute top-1 right-1 w-7 h-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity touch-manipulation"
            onclick={(e) => { e.stopPropagation(); removePhoto(photo, index); }}
            aria-label="Remove photo"
          >
            <X size={14} />
          </button>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Empty state -->
  {#if photos.length === 0 && !uploading}
    <div class="flex flex-col items-center justify-center py-8 text-slate-400 dark:text-slate-500">
      <ImageIcon size={32} class="mb-2 opacity-50" />
      <p class="text-sm">No photos yet</p>
    </div>
  {/if}
</div>

<!-- Lightbox -->
{#if selectedPhotoIndex !== null}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-60 bg-black/95 flex items-center justify-center"
    onclick={closeLightbox}
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <button
      class="absolute top-4 right-4 w-12 h-12 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors touch-manipulation z-10"
      onclick={closeLightbox}
      aria-label="Close"
    >
      <X size={24} />
    </button>

    {#if photos.length > 1}
      <button
        class="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors touch-manipulation z-10"
        onclick={(e) => { e.stopPropagation(); previousPhoto(); }}
        aria-label="Previous photo"
      >
        <span class="text-2xl">‹</span>
      </button>

      <button
        class="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition-colors touch-manipulation z-10"
        onclick={(e) => { e.stopPropagation(); nextPhoto(); }}
        aria-label="Next photo"
      >
        <span class="text-2xl">›</span>
      </button>
    {/if}

    <div class="relative max-w-7xl max-h-[90vh] w-full h-full flex items-center justify-center p-4">
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <img
        src={photos[selectedPhotoIndex]}
        alt="Photo {selectedPhotoIndex + 1}"
        class="max-w-full max-h-full object-contain"
        onclick={(e) => e.stopPropagation()}
      />
    </div>

    {#if photos.length > 1}
      <div class="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/50 px-3 py-1 rounded-full">
        {selectedPhotoIndex + 1} / {photos.length}
      </div>
    {/if}
  </div>
{/if}
