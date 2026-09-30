import clsx from "clsx";
import { FormHTMLAttributes } from "react";

type Props = FormHTMLAttributes<HTMLFormElement>;

export default function Form(props: Props) {
  const { className } = props;

  return (
    <form {...props} className={clsx("mt-10 space-y-3", className)}>
      {props.children}
    </form>
  );
}