import GamingRoom from '../components/gaming-room';
import roomManifest from '../public/room/room-manifest.json';

export default function Home() {
  const poster = (roomManifest as { poster?: { url: string } }).poster;
  return <GamingRoom posterUrl={poster?.url ?? '/room-poster.png'} />;
}
