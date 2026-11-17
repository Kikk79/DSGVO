import { forwardRef, useCallback, useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import { controlClasses } from './controlStyles';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Höhe wächst mit dem Inhalt (bis zur per CSS gesetzten max-height). */
  autoGrow?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, autoGrow = false, rows = 4, value, ...rest },
  forwardedRef,
) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);

  const setRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      innerRef.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef],
  );

  useLayoutEffect(() => {
    const node = innerRef.current;
    if (!autoGrow || !node) return;
    node.style.height = 'auto';
    node.style.height = `${node.scrollHeight + 2}px`;
  }, [autoGrow, value]);

  return (
    <textarea
      ref={setRef}
      rows={rows}
      value={value}
      className={cx(controlClasses, 'py-2.5 text-body', autoGrow ? 'resize-none overflow-y-auto' : 'resize-y', className)}
      {...rest}
    />
  );
});
