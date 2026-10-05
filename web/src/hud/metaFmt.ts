// Small helpers shared by the metadata blocks and the plate title.

/** The file name of a path, either separator. */
export function base(path: string) {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return i >= 0 ? path.slice(i + 1) : path
}

/** Qubits per axis for an n-cell edge: the emulator caps the register at 32 positions. */
export const qubitsPerAxis = (n: number) => Math.ceil(Math.log2(Math.max(2, Math.min(n, 32))))
