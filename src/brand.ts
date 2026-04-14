import chalk from "chalk";

/**
 * Paleta oficial HiveMind para el terminal.
 *  - Negro puro #000000
 *  - Amarillo colmena #F9C900
 *  - Blanco #FFFFFF
 *
 * Tagline: "Una colmena de IAs, para un equipo de desarrolladores."
 */
export const HIVE_YELLOW = "#F9C900";
export const HIVE_YELLOW_BRIGHT = "#FFD633";
export const HIVE_BLACK = "#000000";
export const HIVE_WHITE = "#FFFFFF";
export const HIVE_DIM = "#a0a0a0";

export const brand = {
  /** Negro sobre fondo amarillo — como el logo */
  label: chalk.bgHex(HIVE_YELLOW).hex(HIVE_BLACK).bold,
  /** Amarillo brillante sobre negro */
  accent: chalk.hex(HIVE_YELLOW).bold,
  accentSoft: chalk.hex(HIVE_YELLOW),
  white: chalk.hex(HIVE_WHITE).bold,
  dim: chalk.hex(HIVE_DIM),
  success: chalk.hex("#3fb950").bold,
  error: chalk.hex("#ef4444").bold,
  warn: chalk.hex(HIVE_YELLOW_BRIGHT).bold,
};

export const TAGLINE = "Una colmena de IAs, para un equipo de desarrolladores.";

/**
 * Banner del CLI. Sin caja rigida — usa una linea de acento amarillo
 * arriba y abajo cuyo ancho se calcula segun el contenido (titulo +
 * tagline) para evitar que se rompa con strings largos.
 */
export const banner = (): string => {
  const titlePlain = "  H   HiveMind   Watchtower CLI";
  const tagline = TAGLINE;
  const width = Math.max(titlePlain.length, tagline.length + 2);
  const rule = brand.accent("─".repeat(width));

  const titleLine =
    "  " +
    brand.label(" H ") +
    "  " +
    brand.white("HiveMind") +
    "   " +
    brand.dim("Watchtower CLI");

  const taglineLine = "  " + brand.dim(tagline);

  return [rule, titleLine, taglineLine, rule].join("\n");
};
