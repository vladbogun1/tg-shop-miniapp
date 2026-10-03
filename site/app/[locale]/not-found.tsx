import { ErrorScreen } from "@/components/errors/ErrorScreen";

export default function NotFound() {
  return <ErrorScreen code={404} />;
}
