import type { QView } from "../model";

export type DecideProps<T> = {
  job: QView;
  item: T;
  onDone: (message: string) => void;
  onClose: () => void;
  onDirty: (dirty: boolean) => void;
};
