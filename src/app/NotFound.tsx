import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

export function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="font-display text-4xl font-bold uppercase">Not found</h1>
      <p className="mt-2 text-muted">That page doesn’t exist, or the item was deleted.</p>
      <Button asChild variant="primary" className="mt-6"><Link to="/today">Back to Today</Link></Button>
    </div>
  );
}
