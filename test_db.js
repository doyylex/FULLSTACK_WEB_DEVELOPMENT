const mysql = require('mysql2');


const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '123',
  database: 'test'
});

// Probar la conexión
connection.connect((err) => {
  if (err) {
    console.error('Error al conectar a la base de datos: ' + err.stack);
    console.log('\n--- CONSEJO ---');
    console.log('Asegúrate de haber terminado el asistente de configuración de MySQL');
    console.log('y de que la contraseña en este archivo sea correcta.');
    return;
  }

  console.log('Conexión exitosa con el ID ' + connection.threadId);

  // Consulta de prueba
  connection.query('SELECT 1 + 1 AS solution', (error, results, fields) => {
    if (error) throw error;
    console.log('La solución de prueba es: ', results[0].solution);
    connection.end();
  });
});
