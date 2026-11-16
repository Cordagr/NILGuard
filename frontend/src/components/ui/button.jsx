import React from 'react';
import './button.css';

const buttonVariants = new Set(['default', 'destructive', 'outline', 'secondary', 'ghost', 'link']);
const buttonSizes = new Set(['default', 'sm', 'lg', 'icon']);

const Button = React.forwardRef(function Button(
  {
    className = '',
    variant = 'default',
    size = 'default',
    type = 'button',
    ...props
  },
  ref
) {
  const resolvedVariant = buttonVariants.has(variant) ? variant : 'default';
  const resolvedSize = buttonSizes.has(size) ? size : 'default';
  const classes = [
    'shadcn-button',
    `shadcn-button-${resolvedVariant}`,
    `shadcn-button-size-${resolvedSize}`,
    className
  ].filter(Boolean).join(' ');

  return <button ref={ref} type={type} className={classes} data-slot="button" {...props} />;
});

export { Button };
