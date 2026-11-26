// Gramos por ave y día según la semana de vida (posición 0 = semana 1). Misma copia en el frontend.
export const RACIONES_DEFECTO = {
  ALIMENTACION: [25, 50, 85, 120, 150, 170, 185, 195],
  PRODUCCION: [12, 20, 28, 35, 41, 46, 50, 54, 58, 62, 66, 70, 74, 78, 82, 86, 90, 95, 110],
};

export const PROPOSITOS_RACION = Object.keys(RACIONES_DEFECTO);
