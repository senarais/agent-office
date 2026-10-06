import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { Camera, Maximize2, Minus, Plus, LocateFixed } from 'lucide-react';
import { OfficeScene } from './OfficeScene';
import { WORLD } from '../data/office';
import { useOfficeStore } from '../store/useOfficeStore';

export default function OfficeGame() {
  const parent = useRef<HTMLDivElement>(null);
  const game = useRef<Phaser.Game | null>(null);
  const [zoom, setZoom] = useState(1);
  const [ready, setReady] = useState(false);
  const paused = useOfficeStore(s => s.paused);
  useEffect(() => {
    let disposed = false;
    document.fonts.ready.then(() => {
      if (disposed || !parent.current) return;
      game.current = new Phaser.Game({ type: Phaser.CANVAS, parent: parent.current, width: WORLD.width, height: WORLD.height,
        backgroundColor: '#1c2824', pixelArt: true, roundPixels: true, antialias: false,
        render: { preserveDrawingBuffer: true }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        input: { keyboard: false }, scene: OfficeScene, banner: false,
        callbacks: { postBoot: () => setReady(true) },
      });
      const canvas = game.current.canvas; canvas.tabIndex = 0; canvas.setAttribute('aria-label', 'Interactive pixel office. Move with WASD or arrow keys. E to interact.');
    });
    return () => { disposed = true; game.current?.destroy(true); game.current = null; };
  }, []);
  const scene = () => game.current?.scene.getScene('office') as OfficeScene | undefined;
  return <div className="office-world">
    <div className="world-map" ref={parent} data-testid="office-canvas" />
    {!ready && <div className="world-loading"><span className="pixel-loader" />Opening the office…</div>}
    <div className="world-location"><span className="live-dot" /> ABISENA HQ <span className="location-divider">/</span><span>GROUND FLOOR</span></div>
    {paused && <div className="world-paused">Ⅱ &nbsp; A little pause</div>}
    <div className="world-bottom"><div className="director-chip"><span className="gold-dot" />YOU’RE THE DIRECTOR</div><div className="world-toolbox">
      <button aria-label="Take office screenshot" title="Save a little memory" onClick={() => scene()?.snapshot()}><Camera size={15} /></button>
      <span className="tool-separator" />
      <button aria-label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom(scene()?.zoomBy(-0.25) ?? 1)}><Minus size={14} /></button>
      <span className="zoom-value">{Math.round(zoom * 100)}%</span>
      <button aria-label="Zoom in" disabled={zoom >= 2} onClick={() => setZoom(scene()?.zoomBy(0.25) ?? 1)}><Plus size={14} /></button>
      <button aria-label="Reset camera" onClick={() => setZoom(scene()?.zoomBy(-2) ?? 1)}><LocateFixed size={15} /></button>
      <button aria-label="Fullscreen office" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void parent.current?.parentElement?.requestFullscreen(); }}><Maximize2 size={14} /></button>
    </div></div>
  </div>;
}
