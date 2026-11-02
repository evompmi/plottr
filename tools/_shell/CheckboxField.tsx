// A labelled checkbox for an on / off setting in a sidebar or panel: the box
// and its label on one row, in the `.dv-label` type. Every boolean setting
// uses it; segmented buttons (`SegToggle`) are kept for choices between named
// options (Vertical / Horizontal, None / SEM / SD …).

export interface CheckboxFieldProps {
  label: React.ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  title?: string;
  testId?: string;
  style?: React.CSSProperties;
}

export function CheckboxField({
  label,
  checked,
  onChange,
  disabled,
  title,
  testId,
  style,
}: CheckboxFieldProps) {
  return (
    <label
      className="dv-check"
      data-disabled={disabled ? "true" : undefined}
      title={title}
      style={style}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        data-testid={testId}
      />
      <span>{label}</span>
    </label>
  );
}
