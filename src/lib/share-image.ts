/**
 * Draws the 1080 x 1920 share image on a canvas from the "Shared image" artboard (360 x 640 at 3x).
 * Never includes amounts: goal, percent, this month's stamps and the tagline only.
 */
import { ROTATIONS } from '../../shared/stamps.js'
import { t } from '../copy/en.js'

export type ShareData = {
  headline: string          // "Yaw is saving for rent."
  percent: number
  stampedDays: number[]     // day numbers with a stamp
  daysInMonth: number
  monthLabel: string        // "November card"
  stampsLine: string        // "6 stamps this month"
}

const S = 3 // scale
const COLORS = { paper: '#EFE6D4', card: '#FFFBF2', rule: '#D9CDB4', dash: '#C9BC9F', ink: '#23301F', muted: '#545A49', stamp: '#9C3A22', grow: '#2E5A39' }

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w } else line = test
  }
  if (line) lines.push(line)
  return lines
}

export async function drawShareImage(data: ShareData): Promise<HTMLCanvasElement> {
  try { await (document as any).fonts?.load('700 40px Fraunces'); await (document as any).fonts?.load('600 12px "Public Sans"') } catch { /* fonts fall back */ }
  const canvas = document.createElement('canvas')
  canvas.width = 360 * S; canvas.height = 640 * S
  const ctx = canvas.getContext('2d')!
  ctx.scale(S, S)
  const display = (size: number, weight = 700) => `${weight} ${size}px Fraunces, Georgia, serif`
  const ui = (size: number, weight = 400) => `${weight} ${size}px "Public Sans", system-ui, sans-serif`

  ctx.fillStyle = COLORS.paper
  ctx.fillRect(0, 0, 360, 640)

  // Header
  ctx.textBaseline = 'alphabetic'
  ctx.font = display(24)
  ctx.fillStyle = COLORS.ink
  ctx.fillText('Cedi', 24, 52)
  const cediW = ctx.measureText('Cedi').width
  ctx.fillStyle = COLORS.stamp
  ctx.fillText('Nest', 24 + cediW, 52)
  ctx.font = ui(12, 600)
  ctx.fillStyle = COLORS.muted
  ctx.textAlign = 'right'
  ctx.fillText(data.monthLabel.toUpperCase(), 336, 48)
  ctx.textAlign = 'left'

  // Headline
  ctx.font = display(40)
  ctx.fillStyle = COLORS.ink
  const lines = wrap(ctx, data.headline, 312)
  let y = 120
  for (const l of lines.slice(0, 3)) { ctx.fillText(l, 24, y); y += 42 }

  // Stamp grid card
  const cardY = y + 10
  const cols = 6, gap = 6, cell = (312 - 28 - gap * (cols - 1)) / cols, cellH = 40
  const rows = Math.ceil(data.daysInMonth / cols)
  const cardH = 28 + rows * cellH + (rows - 1) * gap
  ctx.fillStyle = COLORS.card
  ctx.strokeStyle = COLORS.rule
  ctx.lineWidth = 1
  roundRect(ctx, 24, cardY, 312, cardH, 14); ctx.fill(); ctx.stroke()
  const stamped = new Set(data.stampedDays)
  let k = 0
  for (let d = 1; d <= data.daysInMonth; d++) {
    const r = Math.floor((d - 1) / cols), c = (d - 1) % cols
    const cx = 38 + c * (cell + gap), cy = cardY + 14 + r * (cellH + gap)
    ctx.setLineDash([3, 3]); ctx.strokeStyle = COLORS.dash
    roundRect(ctx, cx, cy, cell, cellH, 8); ctx.stroke(); ctx.setLineDash([])
    if (stamped.has(d)) {
      ctx.save()
      ctx.translate(cx + cell / 2, cy + cellH / 2)
      ctx.rotate((ROTATIONS[k++ % ROTATIONS.length]! * Math.PI) / 180)
      ctx.strokeStyle = COLORS.stamp; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.stroke()
      ctx.restore()
    }
  }

  // Percent and bar
  let py = cardY + cardH + 44
  ctx.font = display(28)
  ctx.fillStyle = COLORS.ink
  ctx.fillText(t('share.percent', { percent: data.percent }), 24, py)
  py += 12
  ctx.fillStyle = COLORS.rule
  roundRect(ctx, 24, py, 312, 8, 4); ctx.fill()
  ctx.fillStyle = COLORS.grow
  roundRect(ctx, 24, py, Math.max(8, 312 * Math.min(1, data.percent / 100)), 8, 4); ctx.fill()
  py += 28
  ctx.font = ui(14)
  ctx.fillStyle = COLORS.ink
  ctx.fillText(`${data.stampsLine}. ${t('share.imageLine')}`, 24, py)

  // Footer
  ctx.font = ui(13, 700)
  ctx.fillStyle = COLORS.ink
  ctx.fillText(t('brand.tagline'), 24, 596)
  ctx.font = ui(13)
  ctx.fillStyle = COLORS.muted
  ctx.fillText(t('share.imageFooter'), 24, 614)
  return canvas
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('no blob'))), 'image/png'))
}
