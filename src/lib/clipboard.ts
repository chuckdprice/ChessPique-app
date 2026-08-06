/**
 * Put text on the clipboard, reporting whether it landed.
 *
 * The modern API needs a secure context and permission, so a hidden textarea
 * and the old execCommand stand behind it — that path still works on plain
 * http, which is how the app is often run locally. A caller that gets `false`
 * should leave its button unconfirmed rather than claim success.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      document.body.removeChild(area)
      return true
    } catch {
      return false
    }
  }
}
