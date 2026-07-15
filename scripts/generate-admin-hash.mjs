import { hash } from "bcryptjs";

const password = process.env.ADMIN_PASSWORD;

if (!password || password.length < 12) {
  console.error(
    "Define ADMIN_PASSWORD con al menos 12 caracteres antes de ejecutar este comando.",
  );
  process.exitCode = 1;
} else {
  console.log(await hash(password, 12));
}
