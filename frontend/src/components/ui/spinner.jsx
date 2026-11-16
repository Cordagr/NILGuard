import React from 'react';
import { LoaderIcon } from 'lucide-react';

export function Spinner({ className = '', ...props }) {
  return (
    <LoaderIcon
      role="status"
      aria-label="Loading"
      className={`upload-spinner${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}
