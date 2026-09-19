'use client'
import { useEffect, useRef, useState } from 'react'
import { containCity, constrainCamera, zoomCamera, type Camera } from './camera'

type Pointer = { x: number; y: number }
const center = (points: Pointer[]) => ({ x: points.reduce((sum, p) => sum + p.x, 0) / points.length, y: points.reduce((sum, p) => sum + p.y, 0) / points.length })
const distance = (points: Pointer[]) => points.length < 2 ? 0 : Math.hypot(points[1]!.x - points[0]!.x, points[1]!.y - points[0]!.y)

export function useCityCamera(width: number, height: number) {
  const svgRef = useRef<SVGSVGElement>(null)
  const bounds = containCity(width, height)
  const [camera, setCamera] = useState<Camera>(bounds)
  const cameraRef = useRef(camera)
  const pointers = useRef(new Map<number, Pointer>())
  const suppressClick = useRef(false)
  const traveled = useRef(0)
  const update = (next: Camera) => { cameraRef.current = next; setCamera(next) }
  useEffect(() => { const initial = containCity(width, height); cameraRef.current = initial; setCamera(initial) }, [width, height])
  const toWorld = (point: Pointer) => {
    const matrix = svgRef.current?.getScreenCTM()
    return matrix ? new DOMPoint(point.x, point.y).matrixTransform(matrix.inverse()) : point
  }
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const current = cameraRef.current
      const matrix = svg.getScreenCTM()
      if (!matrix) return
      const anchor = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
      update(zoomCamera(current, containCity(width, height), Math.exp(-event.deltaY * (event.ctrlKey ? .01 : .002)), anchor))
    }
    svg.addEventListener('wheel', wheel, { passive: false })
    return () => svg.removeEventListener('wheel', wheel)
  }, [width, height])
  return {
    svgRef, camera,
    handlers: {
      onPointerDown: (event: React.PointerEvent<SVGSVGElement>) => {
        if (event.button !== 0) return
        if (pointers.current.size === 0) { suppressClick.current = false; traveled.current = 0 }
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
        if (pointers.current.size > 1) suppressClick.current = true
        // Preserve the tapped block as the click target while retaining gestures outside it.
        ;(event.target as Element).setPointerCapture(event.pointerId)
      },
      onPointerMove: (event: React.PointerEvent<SVGSVGElement>) => {
        if (!pointers.current.has(event.pointerId)) return
        const before = [...pointers.current.values()]
        const previous = pointers.current.get(event.pointerId)!
        traveled.current += Math.hypot(event.clientX - previous.x, event.clientY - previous.y)
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
        if (traveled.current < 6 && pointers.current.size === 1) return
        suppressClick.current = true
        const after = [...pointers.current.values()]
        const oldCenter = toWorld(center(before)), newCenter = toWorld(center(after))
        let next = cameraRef.current
        const oldDistance = distance(before), newDistance = distance(after)
        if (oldDistance > 0 && newDistance > 0) next = zoomCamera(next, bounds, newDistance / oldDistance, oldCenter)
        const ratio = next.width / cameraRef.current.width
        next = constrainCamera({ ...next, x: next.x + (oldCenter.x - newCenter.x) * ratio, y: next.y + (oldCenter.y - newCenter.y) * ratio }, bounds)
        update(next)
      },
      onPointerUp: (event: React.PointerEvent<SVGSVGElement>) => { pointers.current.delete(event.pointerId) },
      onPointerCancel: (event: React.PointerEvent<SVGSVGElement>) => { pointers.current.delete(event.pointerId); suppressClick.current = true },
      onLostPointerCapture: (event: React.PointerEvent<SVGSVGElement>) => { pointers.current.delete(event.pointerId) },
      onClickCapture: (event: React.MouseEvent<SVGSVGElement>) => {
        if (suppressClick.current && event.detail !== 0) { event.preventDefault(); event.stopPropagation() }
      },
      onKeyDown: (event: React.KeyboardEvent<SVGSVGElement>) => {
        const current = cameraRef.current
        if (['+', '=', '-', '0'].includes(event.key)) {
          event.preventDefault()
          update(event.key === '0' ? bounds : zoomCamera(current, bounds, event.key === '-' ? 1 / 1.25 : 1.25, { x: current.x + current.width / 2, y: current.y + current.height / 2 }))
        } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) && event.target === event.currentTarget) {
          event.preventDefault()
          update(constrainCamera({ ...current, x: current.x + (event.key === 'ArrowLeft' ? -.1 : event.key === 'ArrowRight' ? .1 : 0) * current.width, y: current.y + (event.key === 'ArrowUp' ? -.1 : event.key === 'ArrowDown' ? .1 : 0) * current.height }, bounds))
        }
      },
    },
  }
}
