import type { ReactElement } from 'react';
import { Navigate } from 'react-router';

// NocoQuality has no landing page of its own: the root opens the quality workspace directly. The route stays so
// sign-in and unknown paths, which land on the root, keep working.
export default function HomePage(): ReactElement {
  return <Navigate to='/quality' replace />;
}
