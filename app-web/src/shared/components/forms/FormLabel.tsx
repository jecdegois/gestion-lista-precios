import clsx from "clsx";
import { LabelHTMLAttributes } from "react";

type Props = LabelHTMLAttributes<HTMLLabelElement>;

export default function FormLabel(props: Props) {
  const { className } = props;
  return (
    <label {...props} className={clsx("block", className)}>
      {props.children}
    </label>
  );
}