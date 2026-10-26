let version = 0

export const invalidar = () => {
  version += 1
}

export const versionActual = () => version
