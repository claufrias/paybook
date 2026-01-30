const fs = require("fs");
const readline = require("readline");

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function preguntar(texto) {
    return new Promise(resolve => rl.question(texto, resolve));
}

function obtenerFunciones(texto) {
    const funciones = {};
    const regex = /(async\s+)?function\s+([a-zA-Z0-9_]+)\s*\([^)]*\)\s*\{/g;

    let match;

    while ((match = regex.exec(texto)) !== null) {
        const nombre = match[2];
        const inicio = match.index;
        let nivel = 0;
        let fin = -1;
        let entro = false;

        for (let i = inicio; i < texto.length; i++) {
            if (texto[i] === "{") {
                nivel++;
                entro = true;
            }
            if (texto[i] === "}") nivel--;

            if (entro && nivel === 0) {
                fin = i + 1;
                break;
            }
        }

        if (fin !== -1) {
            funciones[nombre] = texto.slice(inicio, fin);
        }
    }

    return funciones;
}

(async function () {
    console.log("\n🧠 Actualizador automático de funciones\n");

    const archivoDestino = await preguntar("📄 Archivo a modificar (ej: app.js): ");
    const archivoNuevas = await preguntar("🧩 Archivo con funciones nuevas (ej: nuevas.js): ");

    if (!fs.existsSync(archivoDestino)) {
        console.log("❌ Archivo destino no existe");
        rl.close();
        return;
    }

    if (!fs.existsSync(archivoNuevas)) {
        console.log("❌ Archivo nuevas funciones no existe");
        rl.close();
        return;
    }

    let destino = fs.readFileSync(archivoDestino, "utf8");
    let nuevas = fs.readFileSync(archivoNuevas, "utf8");

    const nuevasFunciones = obtenerFunciones(nuevas);

    if (Object.keys(nuevasFunciones).length === 0) {
        console.log("❌ No se detectaron funciones en el archivo nuevo");
        rl.close();
        return;
    }

    // Backup
    fs.writeFileSync(`${archivoDestino}.bak`, destino, "utf8");

    let actualizadas = 0;

    for (const nombre in nuevasFunciones) {
        const regexInicio = new RegExp(`(async\\s+)?function\\s+${nombre}\\s*\\(`);
        const match = destino.match(regexInicio);

        if (!match) {
            console.log(`⚠️ Función no encontrada: ${nombre}`);
            continue;
        }

        const inicio = match.index;
        let nivel = 0;
        let fin = -1;
        let entro = false;

        for (let i = inicio; i < destino.length; i++) {
            if (destino[i] === "{") {
                nivel++;
                entro = true;
            }
            if (destino[i] === "}") nivel--;

            if (entro && nivel === 0) {
                fin = i + 1;
                break;
            }
        }

        if (fin === -1) {
            console.log(`❌ No se pudo cerrar ${nombre}`);
            continue;
        }

        destino =
            destino.slice(0, inicio) +
            "\n" + nuevasFunciones[nombre] + "\n" +
            destino.slice(fin);

        console.log(`✅ Reemplazada: ${nombre}`);
        actualizadas++;
    }

    fs.writeFileSync(archivoDestino, destino, "utf8");

    console.log(`\n🎉 Listo — ${actualizadas} funciones actualizadas`);
    console.log(`🛡️ Backup guardado como ${archivoDestino}.bak`);

    rl.close();
})();
