'use client';

import { CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet';
import type { MapPoint } from '@/components/MapTab';

type LeafletContactsMapProps = {
  points: MapPoint[];
  bounds: [[number, number], [number, number]];
  mode: 'met' | 'work';
};

type ClusterPoint = {
  id: string;
  lat: number;
  lng: number;
  members: MapPoint[];
};

function clusterByGrid(points: MapPoint[], gridSize = 0.05): ClusterPoint[] {
  const clusters = new Map<string, MapPoint[]>();
  for (const point of points) {
    const latKey = Math.round(point.lat / gridSize);
    const lngKey = Math.round(point.lng / gridSize);
    const key = `${latKey}:${lngKey}`;
    const current = clusters.get(key) ?? [];
    current.push(point);
    clusters.set(key, current);
  }

  return [...clusters.entries()].map(([key, members]) => {
    const [latKey, lngKey] = key.split(':').map(Number);
    const hasMulti = members.length > 1;
    const centerLat = hasMulti ? members.reduce((acc, m) => acc + m.lat, 0) / members.length : latKey * gridSize;
    const centerLng = hasMulti ? members.reduce((acc, m) => acc + m.lng, 0) / members.length : lngKey * gridSize;
    return {
      id: key,
      lat: centerLat,
      lng: centerLng,
      members
    };
  });
}

export default function LeafletContactsMap({ points, bounds, mode }: LeafletContactsMapProps) {
  const clustered = clusterByGrid(points);

  return (
    <MapContainer bounds={bounds} className="hoo-leafletMap">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {clustered.map((cluster) => (
        <CircleMarker
          key={`${mode}-${cluster.id}`}
          center={[cluster.lat, cluster.lng]}
          radius={cluster.members.length > 1 ? Math.min(18, 8 + cluster.members.length) : 7}
          pathOptions={{
            color: '#7f0e1f',
            fillColor: '#a51c30',
            fillOpacity: 0.92,
            weight: 2
          }}
        >
          <Tooltip direction="top" offset={[0, -6]} opacity={0.95}>
            {cluster.members.length === 1 ? (
              <>
                <div className="hoo-mapTooltipName">{cluster.members[0].name || 'Unnamed'}</div>
                <div className="hoo-mapTooltipMeta">{cluster.members[0].company || 'No company'}</div>
              </>
            ) : (
              <>
                <div className="hoo-mapTooltipName">{cluster.members.length} contacts nearby</div>
                <div className="hoo-mapTooltipMeta">
                  {cluster.members
                    .slice(0, 4)
                    .map((m) => m.name || 'Unnamed')
                    .join(', ')}
                  {cluster.members.length > 4 ? ` +${cluster.members.length - 4} more` : ''}
                </div>
              </>
            )}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

