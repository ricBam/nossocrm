import type { Metadata } from 'next';
import { RadarPage } from '@/features/radar/RadarPage';

export const metadata: Metadata = { title: 'Radar | NossoCRM' };

export default function Radar() {
    return <RadarPage />;
}
