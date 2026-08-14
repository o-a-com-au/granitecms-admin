import { useParams } from 'react-router';
import { MediaLibrary } from '../media/MediaLibrary.tsx';

export function MediaLibraryPage() {
  const { siteId = '' } = useParams<{ siteId: string }>();

  return (
    <div className="list-page">
      <div className="list-page-inner media-library-page-inner">
        <h1>Media</h1>
        <MediaLibrary siteId={siteId} mode="browse" />
      </div>
    </div>
  );
}
