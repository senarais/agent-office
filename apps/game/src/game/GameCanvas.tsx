import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { OfficeScene } from './OfficeScene';
export function GameCanvas() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => { let game: Phaser.Game | undefined; let disposed = false; void document.fonts.ready.then(() => { if (disposed) return; game = new Phaser.Game({ type: Phaser.CANVAS, parent: host.current!, backgroundColor: '#20382e', pixelArt: true, roundPixels: true, antialias: false, scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight }, input: { keyboard: false }, scene: [OfficeScene], banner: false, render: { preserveDrawingBuffer: true } }); game.canvas.setAttribute('aria-label', 'Office game. WASD to walk, Shift to run, E to interact. Click floor to walk.'); }); return () => { disposed = true; game?.destroy(true); }; }, []);
  return <div ref={host} className="game-canvas" data-testid="office-canvas" />;
}
