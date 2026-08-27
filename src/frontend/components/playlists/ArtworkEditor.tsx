import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { ArrowCounterClockwise, Eraser, Image, PencilSimple, TextT } from '@phosphor-icons/react'
import './artwork-editor.css'

const icons = ['✶', '♥', '☼', '☺', '⚡', '♪', '★', '→']
const colors = ['#24231f', '#8c4534', '#315d67', '#59704d', '#b66f35', '#f0eee6']

export function ArtworkEditor({ value, title, square = false, albumCovers = [], onSave, onCancel }: { value: string | null; title: string; square?: boolean; albumCovers?: string[]; onSave: (value: string | null) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [color, setColor] = useState(colors[0])
  const [size, setSize] = useState(5)
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen')
  const [text, setText] = useState(title)
  const dimensions = square ? [640, 640] : [720, 144]

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const context = canvas.getContext('2d'); if (!context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    if (!value) return
    const image = new window.Image(); image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height); image.src = value
  }, [value, square])

  const point = (event: PointerEvent<HTMLCanvasElement>) => { const rect = event.currentTarget.getBoundingClientRect(); return { x: (event.clientX - rect.left) * event.currentTarget.width / rect.width, y: (event.clientY - rect.top) * event.currentTarget.height / rect.height } }
  const start = (event: PointerEvent<HTMLCanvasElement>) => { drawing.current = true; event.currentTarget.setPointerCapture(event.pointerId); const p = point(event); const context = event.currentTarget.getContext('2d')!; context.beginPath(); context.moveTo(p.x, p.y) }
  const draw = (event: PointerEvent<HTMLCanvasElement>) => { if (!drawing.current) return; const context = event.currentTarget.getContext('2d')!; const p = point(event); context.lineCap = 'round'; context.lineJoin = 'round'; context.lineWidth = size * (square ? 2 : 1); context.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'; context.strokeStyle = color; context.lineTo(p.x, p.y); context.stroke() }
  const stop = () => { drawing.current = false }
  const addText = () => { if (!text.trim()) return; const canvas = canvasRef.current!; const context = canvas.getContext('2d')!; context.globalCompositeOperation = 'source-over'; context.fillStyle = color; context.font = `600 ${square ? 48 : 30}px Geist, sans-serif`; context.fillText(text.trim(), square ? 36 : 28, square ? 590 : 92, canvas.width - 56) }
  const addIcon = (icon: string) => { const canvas = canvasRef.current!; const context = canvas.getContext('2d')!; context.globalCompositeOperation = 'source-over'; context.fillStyle = color; context.font = `${square ? 112 : 58}px 'Segoe UI Symbol'`; context.fillText(icon, canvas.width / 2 - (square ? 45 : 22), canvas.height / 2 + (square ? 38 : 20)) }
  const clear = () => canvasRef.current?.getContext('2d')?.clearRect(0, 0, dimensions[0], dimensions[1])
  const placeImage = (src: string) => { const canvas = canvasRef.current!; const context = canvas.getContext('2d')!; const image = new window.Image(); image.crossOrigin = 'anonymous'; image.onload = () => { context.clearRect(0,0,canvas.width,canvas.height); const scale = Math.max(canvas.width/image.width,canvas.height/image.height); context.drawImage(image,(canvas.width-image.width*scale)/2,(canvas.height-image.height*scale)/2,image.width*scale,image.height*scale) }; image.src = src }
  const upload = (file?: File) => { if (!file || !file.type.startsWith('image/')) return; const reader = new FileReader(); reader.onload = () => placeImage(String(reader.result)); reader.readAsDataURL(file) }

  return <div className="art-editor">
    <canvas ref={canvasRef} width={dimensions[0]} height={dimensions[1]} className={square ? 'square' : ''} onPointerDown={start} onPointerMove={draw} onPointerUp={stop} onPointerCancel={stop} aria-label="Холст для рисунка" />
    <div className="art-editor__tools">
      <button className={tool === 'pen' ? 'active' : ''} onClick={() => setTool('pen')} title="Карандаш"><PencilSimple /></button><button className={tool === 'eraser' ? 'active' : ''} onClick={() => setTool('eraser')} title="Ластик"><Eraser /></button>
      {colors.map((item) => <button key={item} className={`art-editor__color ${color === item ? 'active' : ''}`} style={{ background: item }} onClick={() => setColor(item)} aria-label={`Цвет ${item}`} />)}
      <input type="range" min="2" max="24" value={size} onChange={(event) => setSize(Number(event.target.value))} aria-label="Толщина линии" />
      <button onClick={clear} title="Очистить"><ArrowCounterClockwise /></button>
    </div>
    <div className="art-editor__insert"><input value={text} maxLength={48} onChange={(event) => setText(event.target.value)} placeholder="Текст на наклейке"/><button onClick={addText}><TextT />Добавить текст</button><label><Image />Загрузить<input type="file" accept="image/*" onChange={(event) => upload(event.target.files?.[0])}/></label></div>
    <div className="art-editor__icons" aria-label="Готовые значки">{icons.map((icon) => <button key={icon} onClick={() => addIcon(icon)}>{icon}</button>)}</div>
    {square && albumCovers.length > 0 && <div className="art-editor__albums"><small>Обложка альбома</small>{albumCovers.map((cover) => <button key={cover} onClick={() => placeImage(cover)}><img src={cover} alt="" /></button>)}</div>}
    <div className="art-editor__actions"><button onClick={onCancel}>Отмена</button><button className="primary" onClick={() => onSave(canvasRef.current!.toDataURL(square ? 'image/jpeg' : 'image/png', .88))}>Сохранить</button></div>
  </div>
}
