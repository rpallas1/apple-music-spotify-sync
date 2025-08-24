const chalk = require("chalk");

/**
 * Simple logging utility with colored output.
 */
class Logger {
  static info(message) {
    console.log(chalk.blue("ℹ"), message);
  }

  static success(message) {
    console.log(chalk.green("✓"), message);
  }

  static warning(message) {
    console.log(chalk.yellow("⚠"), message);
  }

  static error(message) {
    console.log(chalk.red("✗"), message);
  }

  static debug(message) {
    if (process.env.LOG_LEVEL === "debug") {
      console.log(chalk.gray("🔍"), message);
    }
  }
}

module.exports = Logger;
