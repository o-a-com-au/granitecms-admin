import { useParams } from 'react-router';
import { MediaLibrary } from '../media/MediaLibrary.tsx';

export function MediaLibraryPage() {
  const { siteId = '' } = useParams<{ siteId: string }>();

  return (
    <div className="list-page">
      <MediaLibrary siteId={siteId} mode="browse" />
    </div>
  );
}
