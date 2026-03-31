import React, { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'framer-motion';
import { FileUp, FileSpreadsheet, Download, RefreshCw, AlertCircle, CheckCircle2, FileCheck } from 'lucide-react';

const MOVEMENT_TYPES = [
  { id: 1, siglas: 'CONOPE', label: 'Consumo en Operación' },
  { id: 2, siglas: 'SALTRA', label: 'Salida por Transferencia' },
  { id: 3, siglas: 'SGSAC', label: 'Consumo en Operación Sin Afectación Contable' },
  { id: 4, siglas: 'FARDIS', label: 'Farmacia Dispensadores' },
  { id: 5, siglas: 'FARBRH', label: 'Farmacia Receta BRH' },
  { id: 6, siglas: 'FARRCO', label: 'Farmacia Receta Controlados' },
  { id: 7, siglas: 'FARGRA', label: 'Farmacia Receta Gratuidad' },
  { id: 8, siglas: 'FARHOS', label: 'Farmacia Receta Hospitalización' },
  { id: 9, siglas: 'FARINF', label: 'Farmacia Receta Infectología' },
  { id: 10, siglas: 'FARVCO', label: 'Farmacia Vale Colectivo' },
  { id: 11, siglas: 'FARVAE', label: 'Farmacia Vale Extraordinario' },
  { id: 12, siglas: 'FARCAN', label: 'Farmacia Canje' },
  { id: 13, siglas: 'FARCAD', label: 'Farmacia Caducado' },
  { id: 14, siglas: 'FARTRA', label: 'Farmacia Traspaso Externo' },
  { id: 15, siglas: 'FARTRS', label: 'Traspaso Interno (Entre Almacenes)' },
  { id: 16, siglas: 'FARTRC', label: 'Farmacia Traspaso de Clave' },
  { id: 17, siglas: 'MERMA', label: 'Merma' },
  { id: 18, siglas: 'FARIN', label: 'Ajuste de inventario' },
  { id: 19, siglas: 'FARTRC', label: 'Farmacia Traspaso de clave' },
  { id: 20, siglas: 'DONACI', label: 'SalidaDonacion' },
  { id: 21, siglas: 'SADIN', label: 'Adecuacion de inventario sin afectación' },
  { id: 22, siglas: 'FarCon', label: 'Factor de Converción' },
  { id: 23, siglas: 'SaLot', label: 'Salida para Lotear' },
];

const ALMACEN_MAPPING = {
  'Farmacia Hospitalaria': 5,
  'Farmacia Gratuita': 4,
};

const SUBALMACEN_MAPPING = {
  '1': 16, // Medicamento (started with 1000)
  '2': 14, // Material de curación (started with 2000)
};

const App = () => {
  const [files, setFiles] = useState({
    kardexFG: null,
    kardexFH: null,
    concentrado: null,
  });
  const [status, setStatus] = useState({ type: 'info', message: 'Selecciona los archivos para comenzar.' });
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e, key) => {
    const file = e.target.files[0];
    if (file) {
      setFiles(prev => ({ ...prev, [key]: file }));
    }
  };

  const processFiles = async () => {
    if (!files.kardexFG || !files.kardexFH || !files.concentrado) {
      setStatus({ type: 'error', message: 'Por favor, sube los tres archivos necesarios.' });
      return;
    }

    setLoading(true);
    setStatus({ type: 'info', message: 'Procesando archivos...' });

    try {
      // 1. Read Kardex Files
      const kardexData = { FG: [], FH: [] };
      
      const readXlsx = async (file) => {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        // The data starts on row 2 (index 1) based on analyze_files output
        return XLSX.utils.sheet_to_json(sheet, { range: 1 });
      };

      kardexData.FG = await readXlsx(files.kardexFG);
      kardexData.FH = await readXlsx(files.kardexFH);

      // Create lookup maps for performance
      // Key: Clave Bien, Value: Array of Kardex items for that Clave
      const createLookup = (data) => {
        const map = new Map();
        data.forEach(item => {
          let clave = String(item['Clave Bien'] || '').trim();
          clave = clave.replace(/^0+/, ''); // safely remove leading zeros

          if (!map.has(clave)) {
            map.set(clave, []);
          }
          map.get(clave).push(item);
        });
        return map;
      };

      const lookupFG = createLookup(kardexData.FG);
      const lookupFH = createLookup(kardexData.FH);

      // 2. Read Concentrado
      const concBuffer = await files.concentrado.arrayBuffer();
      const concWorkbook = XLSX.read(concBuffer);
      // Looking for "S Y E" or "Salida" sheet
      const sySheetName = concWorkbook.SheetNames.find(n => n.toUpperCase().includes('S Y E') || n.toUpperCase().includes('SALIDA')) || concWorkbook.SheetNames[0];
      const sySheet = concWorkbook.Sheets[sySheetName];
      // Determine header row dynamically
      // First try range 0 (header on row 1)
      let syData = XLSX.utils.sheet_to_json(sySheet);
      if (syData.length > 0 && !('Clave' in syData[0]) && !('Clave INPer' in syData[0])) {
         // Fallback to range 1 (header on row 2) like the first example
         syData = XLSX.utils.sheet_to_json(sySheet, { range: 1 });
      }

      // Find the right column name for 'Salida'
      const determineSalidaField = (row) => row['Salida'] || row['Cantidad'] || row['Suma de Salida'] || row['Suma de Salida Junio'];
      
      const filteredSalidas = syData.filter(row => {
        const val = determineSalidaField(row);
        return val && parseFloat(val) > 0;
      });

      if (filteredSalidas.length === 0) {
        throw new Error('No se encontraron registros de salida en el archivo concentrado. Verifica que haya una columna "Salida" o "Cantidad".');
      }

      // Helper to format Excel serial numbers or Strings into DD/MM/YYYY
      const formatExcelDate = (excelDate) => {
        if (!excelDate) return '';
        
        let dateObj;
        if (typeof excelDate === 'number') {
          // Convert Excel serial date to JS Date
          dateObj = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
          // Offset timezone to avoid getting the day before
          dateObj.setMinutes(dateObj.getMinutes() + dateObj.getTimezoneOffset());
        } else if (excelDate instanceof Date) {
          dateObj = excelDate;
        } else {
          // If it's a string, e.g. "2026-06-30 00:00:00", extract the date part
          const str = String(excelDate).trim();
          const datePart = str.includes(' ') ? str.split(' ')[0] : str;
          if (datePart.includes('-')) {
             const parts = datePart.split('-');
             if (parts.length === 3 && parts[0].length === 4) { // YYYY-MM-DD
                 return `${parts[2]}/${parts[1]}/${parts[0]}`;
             }
          }
          return datePart;
        }

        const d = String(dateObj.getDate()).padStart(2, '0');
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const y = dateObj.getFullYear();
        return `${d}/${m}/${y}`;
      };

      // 3. Transformation Logic
      const newEncabezado = [];
      const newDetalle = [];
      const folioMap = new Map(); // Key: Tipo_Almacen_Fecha, Value: FolioTemp

      filteredSalidas.forEach((row, index) => {
        let rawClave = String(row['Clave'] || row['Clave INPer'] || '').trim();
        rawClave = rawClave.replace(/^0+/, ''); // safely remove leading zeros
        
        let rawLote = String(row['Lote a sacar'] || '').trim().toUpperCase().replace(/\s+/g, '');
        const rawAlmacen = String(row['Almacen'] || '').trim();
        const rawTipoSalida = String(row['Tipo de Salida'] || '').trim();
        const valSalida = parseFloat(determineSalidaField(row));
        
        let rawFecha = row['Fecha de Surtimiento'] || row['Fecha Surtimiento'] || row['Fecha de Elaboración'] || row['Fecha de Elaboracion'] || row['Fecha de Autorización'] || row['Fecha y hora de solicitud'];
        // Handle JS Date or Serial Date
        let dateObj;
        if (typeof rawFecha === 'number') {
          dateObj = new Date(Math.round((rawFecha - 25569) * 86400 * 1000));
          dateObj.setMinutes(dateObj.getMinutes() + dateObj.getTimezoneOffset());
        } else if (rawFecha) {
          dateObj = new Date(rawFecha);
        } else {
          dateObj = new Date(); // Fallback to current date
        }
        
        // Quitar la parte de tiempo (hours) a 0 para el match
        dateObj.setHours(0, 0, 0, 0);
        const fechaStr = dateObj.toISOString().split('T')[0];
        
        let almacenId = 5; // Default to FH
        if (rawAlmacen.toLowerCase().includes('gratui')) {
          almacenId = 4; // Farmacia Gratuita o Gratuidad
        }
        
        // Find movement type ID
        const mvType = MOVEMENT_TYPES.find(t => 
          rawTipoSalida.toLowerCase().includes(t.label.toLowerCase()) || 
          t.label.toLowerCase().includes(rawTipoSalida.toLowerCase())
        );
        const tipoMovId = mvType ? mvType.id : 1; // Default to CONOPE

        // Subalmacen determination
        const subAlmacenId = SUBALMACEN_MAPPING[rawClave[0]] || 16;

        // Folio generation: Tomar Valor Vale INPer
        const rawVale = row['Vale INPer'] || row['Vale Inper'] || row['Vale'] || row['Folio Vale'] || row['Folio Vale INPer'];
        let currentFolio;
        if (rawVale) {
          const valeStr = String(rawVale).replace(/\D/g, ''); // Extract purely numeric portion
          currentFolio = valeStr ? parseInt(valeStr, 10) : parseInt(`${tipoMovId}${subAlmacenId}${almacenId}`, 10);
        } else {
          currentFolio = parseInt(`${tipoMovId}${subAlmacenId}${almacenId}`, 10);
        }

        // Grouping key for Encabezado
        const groupKey = `${currentFolio}_${fechaStr}`;
        
        if (!folioMap.has(groupKey)) {
          folioMap.set(groupKey, currentFolio);
          
          newEncabezado.push({
            'Folio Temp (Integer)': currentFolio,
            'Año (Integer)': dateObj.getFullYear() || new Date().getFullYear(),
            'Tipo Movimiento (Integer)': tipoMovId,
            'Almacén Salida (Integer)': almacenId,
            'Destino (Integer)': 8, // Predefined as 8 based on example
            'Fecha Movimiento (Date)': formatExcelDate(dateObj),
            'Usuario Elabora (Integer Usuario Activo)': 316,
            'Empleado (Integer)': 996,
            'Sub Almacén (Integer)': subAlmacenId,
          });
        }

        // Kardex lookup
        const kardexSource = almacenId === 4 ? lookupFG : lookupFH;
        const possibleItems = kardexSource.get(rawClave) || [];
        
        let kardexItem = null;
        
        if (possibleItems.length > 0) {
          // 1. Coincidencia exacta
          kardexItem = possibleItems.find(item => {
            const itemLote = String(item['Lote'] || '').trim().toUpperCase().replace(/\s+/g, '');
            return itemLote === rawLote;
          });
          
          // 2. Coincidencia parcial (substring) e.g., "L3Y5442" in "3Y5442"
          if (!kardexItem) {
            kardexItem = possibleItems.find(item => {
              const itemLote = String(item['Lote'] || '').trim().toUpperCase().replace(/\s+/g, '');
              return itemLote.includes(rawLote) || rawLote.includes(itemLote);
            });
          }
          
          // 3. Ignorar prefijos comunes en lotes y comparar partes limpias
          if (!kardexItem) {
            const cleanRawLote = rawLote.replace(/[^A-Z0-9]/g, '').replace(/^(L|LOTE|LOT)/, '');
            kardexItem = possibleItems.find(item => {
              const itemLote = String(item['Lote'] || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(L|LOTE|LOT)/, '');
              return itemLote === cleanRawLote || itemLote.includes(cleanRawLote) || cleanRawLote.includes(itemLote);
            });
          }
          
          // 4. Si la clave (Bien) coincide pero el lote es totalmente diferente,
          // asignamos el primer kardex disponible porque es seguro que es el mismo producto
          if (!kardexItem) {
            kardexItem = possibleItems[0];
          }
        }

        if (kardexItem) {
          newDetalle.push({
            'Año (Integer)': dateObj.getFullYear() || new Date().getFullYear(),
            'Folio Temp. (Integer)': currentFolio,
            'id_bien': kardexItem['id_bien'],
            'Lote Correcto FH': kardexItem['Lote'], // Forzado desde el reporte Kardex (Existencias)
            'Fecha Caducidad (Date)': formatExcelDate(kardexItem['Fecha Caducidad']),
            'Cantidad Salida (Decimal)': valSalida,
            'Kardex Bien (Integer)': kardexItem['id_kardex'],
            'Unidad Medida (Integer)': kardexItem['id_unidadmedida'],
          });
        } else {
          // If not found in kardex, we still include but some fields might be missing
          // Optimization: could search only by Clave as fallback if Lote doesn't match
          console.warn(`No se encontró kardex para clave ${rawClave} lote ${rawLote}`);
          newDetalle.push({
            'Año (Integer)': dateObj.getFullYear() || new Date().getFullYear(),
            'Folio Temp. (Integer)': currentFolio,
            'id_bien': row['Clave de Cuadro Básico'] || 0,
            'Lote Correcto FH': rawLote,
            'Fecha Caducidad (Date)': formatExcelDate(row['Caducidad'] || row['Caducidad ']),
            'Cantidad Salida (Decimal)': valSalida,
            'Kardex Bien (Integer)': 0,
            'Unidad Medida (Integer)': 271, // Default from example
          });
        }
      });

      // 4. Create Workbook
      const wb = XLSX.utils.book_new();
      const wsEnc = XLSX.utils.json_to_sheet(newEncabezado);
      const wsDet = XLSX.utils.json_to_sheet(newDetalle);
      
      XLSX.utils.book_append_sheet(wb, wsEnc, 'Encabezado');
      XLSX.utils.book_append_sheet(wb, wsDet, 'Detalle');

      // 5. Download
      XLSX.writeFile(wb, 'SalidasSIFGO_Generado.xlsx');
      
      setStatus({ type: 'success', message: '¡Layout generado con éxito! El archivo se ha descargado.' });
    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', message: `Error al procesar: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const getFileInputClass = (file) => {
    return `file-input-wrapper ${file ? 'active' : ''}`;
  };

  return (
    <div className="container">
      <header className="header">
        <motion.h1 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          SIFGO Layout Gen
        </motion.h1>
        <p>Generador automático de layouts para el sistema SIFGO v7</p>
      </header>

      <main className="card">
        <div className="upload-grid">
          {/* Kardex FG */}
          <div className={getFileInputClass(files.kardexFG)}>
            <input type="file" accept=".xlsx,.xls" onChange={(e) => handleFileChange(e, 'kardexFG')} />
            <div className={`file-info ${files.kardexFG ? 'success' : ''}`}>
              {files.kardexFG ? <FileCheck /> : <FileUp />}
              <span className="file-name">{files.kardexFG ? files.kardexFG.name : 'Vacio'}</span>
              <span className="file-label">KARDEX EXISTENCIAS FG</span>
            </div>
          </div>

          {/* Kardex FH */}
          <div className={getFileInputClass(files.kardexFH)}>
            <input type="file" accept=".xlsx,.xls" onChange={(e) => handleFileChange(e, 'kardexFH')} />
            <div className={`file-info ${files.kardexFH ? 'success' : ''}`}>
              {files.kardexFH ? <FileCheck /> : <FileUp />}
              <span className="file-name">{files.kardexFH ? files.kardexFH.name : 'Vacio'}</span>
              <span className="file-label">KARDEX EXISTENCIAS FH</span>
            </div>
          </div>

          {/* Concentrado */}
          <div className={getFileInputClass(files.concentrado)}>
            <input type="file" accept=".xlsx,.xls" onChange={(e) => handleFileChange(e, 'concentrado')} />
            <div className={`file-info ${files.concentrado ? 'success' : ''}`}>
              {files.concentrado ? <FileSpreadsheet /> : <FileUp />}
              <span className="file-name">{files.concentrado ? files.concentrado.name : 'Vacio'}</span>
              <span className="file-label">CONCENTRADO ENTRADAS/SALIDAS</span>
            </div>
          </div>
        </div>

        <button 
          className="generate-btn" 
          onClick={processFiles} 
          disabled={loading || !files.kardexFG || !files.kardexFH || !files.concentrado}
        >
          {loading ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
            >
              <RefreshCw size={20} />
            </motion.div>
          ) : (
            <Download size={20} />
          )}
          {loading ? 'Procesando...' : 'Generar Layout SIFGO'}
        </button>

        <AnimatePresence>
          {status.message && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`status-message ${status.type}`}
            >
              {status.type === 'error' && <AlertCircle size={18} style={{ verticalAlign: 'middle', marginRight: '8px' }} />}
              {status.type === 'success' && <CheckCircle2 size={18} style={{ verticalAlign: 'middle', marginRight: '8px' }} />}
              {status.message}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer>
        &copy; 2026 Antigravity SIFGO Tools &bull; Optimizado con IA
      </footer>
    </div>
  );
};

export default App;
