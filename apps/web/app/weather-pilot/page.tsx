import type { Metadata } from 'next';
import WeatherPilot from './weather-pilot';

export const metadata: Metadata = {
  title: 'Weather Planning Pilot for Contractors | AI Data Marketplace',
  description: 'Preview a source-attributed National Weather Service forecast summary and tell us what weather planning information your field team needs.',
  alternates: { canonical: '/weather-pilot' },
};

export default function WeatherPilotPage() {
  return <WeatherPilot />;
}
