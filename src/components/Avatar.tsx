import { useEffect, useRef } from 'react';
import { drawCharacter } from '../game/art';
import type { Agent } from '../types';

export function Avatar({ agent, size = 40, director = false }: { agent?: Agent; size?: number; director?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const person = agent ?? { id: 'director', skin: '#dca986', hair: '#413731', color: '#e6ca8c' };
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) { ctx.clearRect(0, 0, 28, 38); drawCharacter(ctx, person, 0, 0, director); }
  }, [person.id, director]);
  return <span className={`avatar ${director ? 'avatar-director' : ''}`} style={{ width: size, height: size, '--agent-color': person.color } as React.CSSProperties}>
    <canvas ref={canvas} width={28} height={38} aria-label={agent ? `${agent.name}’s pixel avatar` : 'Director avatar'} />
  </span>;
}
