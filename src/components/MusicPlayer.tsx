import { Music2, Play, Pause, SkipBack, SkipForward, Shuffle, Volume2 } from 'lucide-react';
import { useOfficeStore } from '../store/useOfficeStore';
import { TRACKS } from '../lib/audio';

export function MusicPlayer({ expanded = false }: { expanded?: boolean }) {
  const audio = useOfficeStore(s => s.audio), setAudio = useOfficeStore(s => s.setAudio), next = useOfficeStore(s => s.nextTrack);
  const settings = useOfficeStore(s => s.settings), update = useOfficeStore(s => s.updateSettings);
  const track = TRACKS[audio.track];
  return <section className={`music-player ${expanded ? 'music-expanded' : ''}`} aria-label="Music player">
    <div className="music-heading"><span><Music2 size={13} /> A SOUNDTRACK FOR SMALL WINS</span><span className={`equalizer ${audio.playing && !settings.muted ? 'playing' : ''}`}><i /><i /><i /><i /></span></div>
    <div className="music-track"><div className={`album-art ${audio.playing ? 'spinning' : ''}`}><span /><i /></div><div><strong>{track.title}</strong><small>{track.artist} <span>·</span> cozy pixel beats</small></div></div>
    <div className="music-controls"><button aria-label="Shuffle tracks" aria-pressed={audio.shuffle} className={audio.shuffle ? 'is-active' : ''} onClick={() => setAudio({ shuffle: !audio.shuffle })}><Shuffle size={14} /></button><div><button aria-label="Previous track" onClick={() => next(-1)}><SkipBack size={15} /></button><button className="music-play" aria-label={audio.playing ? 'Pause music' : 'Play music'} onClick={() => setAudio({ playing: !audio.playing })}>{audio.playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</button><button aria-label="Next track" onClick={() => next()}><SkipForward size={15} /></button></div><button aria-label={settings.muted ? 'Unmute music' : 'Mute music'} className={settings.muted ? 'is-muted' : ''} onClick={() => update({ muted: !settings.muted })}><Volume2 size={15} /></button></div>
    {expanded && <><label className="volume-row">Music volume <input aria-label="Music volume" type="range" min="0" max="100" value={settings.musicVolume} onChange={e => update({ musicVolume: +e.target.value })} /><span>{settings.musicVolume}%</span></label><p className="muted small">Original, locally generated melodies. No streaming, no downloads. Just a little atmosphere.</p></>}
  </section>;
}
