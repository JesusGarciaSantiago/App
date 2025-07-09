import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, updateDoc, deleteDoc, doc, query, orderBy, getDocs, setDoc } from 'firebase/firestore';
// Componente para la gráfica de círculo (Pie Chart)
const PieChart = ({ data, totalItems, title }) => {
  if (totalItems === 0) {
    return <p className="text-center text-gray-500 mt-4">No hay datos para la gráfica.</p>;
  }

  let cumulativeAngle = 0;
  const radius = 45; // Radio de la gráfica de círculo
  const centerX = 50; // Centro X del viewBox SVG
  const centerY = 50; // Centro Y del viewBox SVG

  // Función para obtener coordenadas en un ángulo dado
  const getCoordinatesForAngle = (angle) => {
    const x = centerX + radius * Math.cos(angle * Math.PI / 180);
    const y = centerY + radius * Math.sin(angle * Math.PI / 180);
    return { x, y };
  };

  return (
    <div className="flex flex-col items-center p-4 bg-white rounded-lg shadow-md print:shadow-none print:border print:p-2">
      <h3 className="text-xl font-bold text-gray-700 mb-4">{title}</h3>
      <svg width="150" height="150" viewBox="0 0 100 100" className="flex-shrink-0">
        {data.map((slice, index) => {
          const startAngle = cumulativeAngle;
          const endAngle = cumulativeAngle + (slice.value / totalItems) * 360;
          cumulativeAngle = endAngle;

          const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0;

          const start = getCoordinatesForAngle(startAngle);
          const end = getCoordinatesForAngle(endAngle);

          // Comando de ruta SVG para dibujar un arco de un sector circular
          const d = [
            `M ${centerX},${centerY}`, // Mover al centro
            `L ${start.x},${start.y}`, // Línea al inicio del arco
            `A ${radius},${radius} 0 ${largeArcFlag} 1 ${end.x},${end.y}`, // Arco
            `Z` // Cerrar la ruta al centro
          ].join(' ');

          return (
            <path
              key={index}
              d={d}
              fill={slice.color}
              stroke="white"
              strokeWidth="0.5"
            />
          );
        })}
      </svg>
      <div className="mt-4 text-sm text-gray-700 w-full px-2">
        {data.map((slice, index) => (
          <p key={index} className="flex items-center justify-between py-1">
            <span className="flex items-center">
              <span className="inline-block w-3 h-3 rounded-full mr-2" style={{ backgroundColor: slice.color }}></span>
              {slice.name}
            </span>
            <span className="font-semibold">{((slice.value / totalItems) * 100).toFixed(1)}% ({slice.value})</span>
          </p>
        ))}
        <p className="flex items-center justify-between py-1 border-t mt-2 pt-2 font-bold">
            <span>Total Items:</span>
            <span>{totalItems}</span>
        </p>
      </div>
    </div>
  );
};


// Main App Component
function App() {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [firebaseUserId, setFirebaseUserId] = useState(null); // Firebase user UID
  const [selectedSupervisor, setSelectedSupervisor] = useState(null); // Selected supervisor name
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [spaces, setSpaces] = useState([]);
  const [selectedSpace, setSelectedSpace] = useState(null); // Currently selected space
  const [areas, setAreas] = useState([]); // Areas for the selected space
  const [selectedArea, setSelectedArea] = useState(null); // Corrected: Using useState(null)
  const [checklistItems, setChecklistItems] = useState([]); // Checklist items for the selected area
  const [newItemText, setNewItemText] = useState('');
  const [newObservationText, setNewObservationText] = useState('');
  const [selectedImageForNewItem, setSelectedImageForNewItem] = useState(null); // Corrected: Using useState(null)
  const [showReport, setShowReport] = useState(false); // To toggle report view
  const [allSupervisedAreas, setAllSupervisedAreas] = useState([]); // Data for the report
  const [pieChartStats, setPieChartStats] = useState({ totalItems: 0, data: [] }); // Stats for the pie chart (all statuses, filtered by selectedSpace)
  const [pieChartCompletedStats, setPieChartCompletedStats] = useState({ totalItems: 0, data: [] }); // Stats for the pie chart (Cumple & No Cumple, global)
  const [showConfirmationModal, setShowConfirmationModal] = useState(false); // State for confirmation modal
  const [modalMessage, setModalMessage] = useState(''); // Message for the confirmation modal

  // List of supervisors
  const supervisors = ["Ruth Montoya", "Sandra Unzueta", "Carlos López"];

  // Firebase Initialization and Authentication
  useEffect(() => {
    // These global variables are provided by the Canvas environment.
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
    const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
    const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null; 

    if (Object.keys(firebaseConfig).length > 0) {
      const app = initializeApp(firebaseConfig);
      const firestore = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestore);
      setAuth(firebaseAuth);

      const unsubscribeAuth = onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          // User is signed in.
          setFirebaseUserId(user.uid);
          setIsAuthReady(true);
        } else {
          // User is signed out, try to sign in anonymously if no custom token.
          if (!initialAuthToken) {
            try {
              const anonUserCredential = await signInAnonymously(firebaseAuth);
              setFirebaseUserId(anonUserCredential.user.uid);
              setIsAuthReady(true);
            } catch (error) {
              console.error("Error signing in anonymously:", error);
              setIsAuthReady(true); // Still mark as ready even on error to avoid blocking UI
            }
          }
        }
      });

      // Attempt to sign in with custom token if available
      const signInWithToken = async () => {
        if (initialAuthToken) {
          try {
            await signInWithCustomToken(firebaseAuth, initialAuthToken);
          } catch (error) {
            console.error("Error signing in with custom token:", error);
            // Fallback to anonymous sign-in if custom token fails
            try {
                console.log("Intentando iniciar sesión anónimamente debido a un token personalizado inválido.");
                const anonUserCredential = await signInAnonymously(firebaseAuth);
                setFirebaseUserId(anonUserCredential.user.uid);
            } catch (anonError) {
                console.error("Error al iniciar sesión anónimamente después de que el token personalizado fallara:", anonError);
            }
          } finally {
            setIsAuthReady(true);
          }
        } else {
            // If no initialAuthToken, onAuthStateChanged will handle anonymous sign-in
            setIsAuthReady(true);
        }
      };
      signInWithToken();

      return () => unsubscribeAuth();
    }
  }, []);

  // Fetch Spaces
  useEffect(() => {
    if (db && isAuthReady) {
      const spacesColRef = collection(db, `artifacts/${__app_id}/public/data/spaces`);
      // Ordering by 'createdAt' to ensure consistent display order. Firestore may require an index for this query.
      const q = query(spacesColRef, orderBy("createdAt", "asc"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedSpaces = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setSpaces(fetchedSpaces);
      }, (error) => {
        console.error("Error fetching spaces:", error);
      });
      return () => unsubscribe();
    }
  }, [db, isAuthReady]);

  // Define the default checklist for workshop areas
  const workshopChecklist = [
    { text: "El personal porta el uniforme y equipo de manera correcta" },
    { text: "Los PPL cuentan con las medidas de seguridad para el uso de herramientas y máquinas" },
    { text: "El lugar cuenta con un orden visual y limpieza de área" },
    { text: "Cuenta con los Oficios de PPL autorizadas para el uso de herramienta" },
    { text: "Cuenta con su inventario de herramienta general actualizado" },
    { text: "Toda la herramienta se encuentra en buen estado y no hay existencia de herramienta echiza" },
    { text: "Se realiza de forma correcta el préstamo de herramienta (colocando la etiqueta de préstamo en la sombra de la herramienta prestada y se realiza el llenado correspondiente en la bitácora de préstamo)" },
    { text: "Toda la herramienta se encuentra marcada con su respectivo código de identificación." },
    { text: "Toda la herramienta se encuentra colocada dentro de su sombra (o en defecto, con una etiqueta de préstamo)" },
    { text: "Las máquinas se encuentran identificadas con su código y están dentro del área marcada para su uso." },
    { text: "El inventario de los insumos de PPL coincide con el contenido físico." },
    { text: "No se encuentran objetos prohibidos dentro del taller" },
    { text: "El lavaojos se encuentra funcionando perfectamente" },
    { text: "Se realiza de forma correcta la entrega de tóxico (Realizando el registro en bitácora y en los Kardex)" },
    { text: "Todos los tóxicos se encuentran debidamente colocados y organizados" },
    { text: "Todos tóxicos cuentan con su Kardex y su pictograma" },
    { text: "Dentro del área de tóxicos se cuenta con la guía de uso, tabla de incompatibilidad, equipo de seguridad y charolas antiderrames" },
    { text: "La infraestructura se encuentra en buen estado" },
    { text: "No se encuentran alimentos dentro del área" },
    { text: "Se encuentra señalética, extintores, detector de humo, botiquín de primeros auxilios en materia de protección civil dentro del taller" },
    { text: "Los artículos de oficina se encuentran identificados e inventariados" },
    { text: "Anaqueles identificados" },
    { text: "Enceres de limpieza en buen estado e identificadas al área" },
  ];

  const workshopAreaNames = [
    "Taller TP1",
    "Taller TP2",
    "Taller TS1",
    "Taller TS2",
    "Taller RS3",
    "Taller TS4",
  ];

  // Checklist for "Cocinas" areas
  const cocinasChecklist = [
    { text: "El lugar cuenta con un orden visual y limpieza de área" },
    { text: "El área de alimentos cuenta con hawaianas" },
    { text: "El personal porta el uniforme y equipo de manera correcta" },
    { text: "Los PPL portan el equipo de protección personal: (Cofia/gorro, uniforme/delantal/ cubre bocas/guantes)" },
    { text: "Los PPL no presenta signos de: tos, secreción nasal, heridas en ares corporales que entran en contacto con materias primas o productos" },
    { text: "El personal cuenta con capacitación laboral de cocina" },
    { text: "La infraestructura se encuentra en buen estado" },
    { text: "El área se encuentra sin presencia de fauna nociva" },
    { text: "Se cuenta con pasamanos y rampas de acceso para personas con discapacidad" },
    { text: "Señalética visible de limpieza y desinfección de alimentos y utensilios" },
    { text: "Se encuentra señalética, extintores, detector de humo, botiquín de primeros auxilios en materia de protección civil dentro del área" },
    { text: "Se encuentra de forma visual el menú del día" },
    { text: "Cuenta con los Oficios de PPL autorizadas para el uso de los utensilios generales" },
    { text: "Cuenta con los Oficios de PPL autorizadas para el uso de los utensilios punzocortantes" },
    { text: "Cuenta con su inventario de utensilios general y punzocortantes" },
    { text: "Todos los utensilios se encuentran en buen estado y no hay existencia utensilios hechizos" },
    { text: "Se realiza de forma correcta el préstamo de utensilios (colocando la etiqueta de préstamo en la sombra del utensilio prestado y se realiza el llenado correspondiente en la bitácora de préstamo)" },
    { text: "Todos los utensilios se encuentran marcados con su respectivo código de identificación." },
    { text: "Todos los utensilios se encuentran colocados dentro de su sombra (o en defecto, con una etiqueta de préstamo)" },
    { text: "Los utensilios punzocortantes que no son utilizados se encuentran en resguardo bajo llave" },
    { text: "El inventario de los insumos coincide con el contenido físico." },
    { text: "Se realiza un registro en el control de uso del encendedor y se encuentra en resguardo bajo llave" },
    { text: "Se llevan acabo los controles de temperatura de congeladores (temperatura mínima -18)" },
    { text: "Se llevan acabo los controles de temperatura de refrigeradores (temperatura mínima -4)" },
    { text: "Se cuenta mínimo con 3 muestras testigo previas al servicio" },
    { text: "Las muestras testigo se mantienen en congelación" },
    { text: "Las muestras testigo cuentan con un registro de temperatura y descripción del servicio" },
    { text: "Las muestras testigo Coincide la descripción de las muestras con sus registros en bitácora" },
    { text: "Uso de lámparas anti moscas" },
    { text: "Los insumos cuentan con fecha de caducidad" },
    { text: "Los insumos cuentan con consumo preferente" },
    { text: "Se cuenta con un Inventario de insumos" },
    { text: "Se respeta el nivel de estiba máxima y se tiene marcada dentro del área" },
    { text: "En caso de contar con artículos de limpieza pertenecientes al área, se encuentran marcadas" },
    { text: "Sin presencia de almacenamiento de productos químicos para limpieza (en su defecto, identificado y controlado)" },
    { text: "Se lleva acabo el monitoreo del nivel de cloro" },
    { text: "El manejo de residuos se realiza de forma adecuada (separación de residuos)" },
  ];

  // Checklist for "Panadería" areas
  const panaderiaChecklist = [
    { text: "Señalética visible de limpieza y desinfección de alimentos y utensilios" },
    { text: "Se encuentra señalética, extintores, detector de humo, botiquín de primeros auxilios en materia de protección civil dentro del área" },
    { text: "Cuenta con los Oficios de PPL autorizadas para el uso de los utensilios generales" },
    { text: "Cuenta con los Oficios de PPL autorizadas para el uso de los utensilios punzocortantes" },
    { text: "Cuenta con su inventario de utensilios general y punzocortantes" },
    { text: "Todos los utensilios se encuentran en buen estado y no hay existencia utensilios hechizos o de madera" },
    { text: "Se realiza de forma correcta el préstamo de utensilios (colocando la etiqueta de préstamo en la sombra del utensilio prestado y se realiza el llenado correspondiente en la bitácora de préstamo)" },
    { text: "Todos los utensilios se encuentra marcados con su respectivo código de identificación." },
    { text: "Todos los utensilios se encuentran colocados dentro de su sombra (o en defecto, con una etiqueta de préstamo)" },
    { text: "Los utensilios punzocortantes que no son utilizados se encuentran en resguardo bajo llave" },
    { text: "Se llevan acabo los controles de temperatura de congeladores (temperatura mínima -18)" },
    { text: "Se llevan acabo los controles de temperatura de refrigeradores (temperatura mínima 4)" },
    { text: "Se cuenta con un Inventario de insumos" },
    { text: "El inventario de los insumos coincide con el contenido físico." },
    { text: "Se respeta el nivel de estiba máxima y se tiene marcada dentro del área" },
    { text: "En caso de contar con artículos de limpieza pertenecientes al área, se encuentran marcadas" },
    { text: "Sin presencia de almacenamiento de productos químicos para limpieza (en su defecto, identificado y controlado)" },
    { text: "Se lleva acabo el monitoreo del nivel de cloro" },
    { text: "El manejo de residuos se realiza de forma adecuada (separación de residuos)" },
    { text: "Se realiza un registro en el control de uso del encendedor y se encuentra en resguardo bajo llave" },
  ];

  // Checklist for "Tortillería" areas
  const tortilleriaChecklist = [
    { text: "Señalética visible de limpieza y desinfección de alimentos y utensilios" },
    { text: "Se encuentra señalética, extintores, detector de humo, botiquín de primeros auxilios en materia de protección civil dentro del área" },
    { text: "Cuenta con los Oficios de PPL autorizadas para el uso de los utensilios generales" },
    { text: "Cuenta con su inventario de utensilios general" },
    { text: "Todos los utensilios se encuentran en buen estado y no hay existencia utensilios hechizos o de madera" },
    { text: "Se realiza de forma correcta el préstamo de utensilios (colocando la etiqueta de préstamo en la sombra del utensilio prestado y se realiza el llenado correspondiente en la bitácora de préstamo)" },
    { text: "Todos los utensilios se encuentra marcados con su respectivo código de identificación." },
    { text: "Todos los utensilios se encuentran colocados dentro de su sombra (o en defecto, con una etiqueta de préstamo)" },
    { text: "Se respeta el nivel de estiba máxima y se tiene marcada dentro del área" },
    { text: "En caso de contar con artículos de limpieza pertenecientes al área, se encuentran marcadas" },
    { text: "Sin presencia de almacenamiento de productos químicos para limpieza (en su defecto, identificado y controlado)" },
    { text: "El manejo de residuos se realiza de forma adecuada (separación de residuos)" },
  ];

  // Checklist for "Pedagogía" areas
  const pedagogiaChecklist = [
    { text: "El lugar cuenta con un orden visual y limpieza de área" },
    { text: "Cuenta con los Oficios de PPL autorizadas para el uso de libros" },
    { text: "Cuenta con su inventario de libros general actualizado" },
    { text: "Cuenta con un control de préstamo de libros" },
  ];

  // Checklist for "Deportes" areas
  const deportesChecklist = [
    { text: "El lugar cuenta con un orden visual y limpieza de área" },
    { text: "Cuenta con un inventario general de su material actualizado" },
  ];

  // Checklist for "Estancias" areas
  const estanciasChecklist = [
    { text: "Al ingresar a los módulos se encuentra bajo control los accesos" },
    { text: "Uso de la bitácora para el registro de ingresos" },
    { text: "Limpieza visual general en las áreas de convivencia y pasillos" },
    { text: "Reglas de convivencia y cronograma de actividades a la vista" },
    { text: "Las estancias se encuentran limpias y ordenadas" },
    { text: "Todos los PPL de las estancias cuentan con su hoja de inventario actualizada (digital o físico)" },
    { text: "Sólo se encuentran el número de vasos de acuerdo a ocupantes de estancia" },
    { text: "Cuentan con servicio de agua en regadera y baño" },
    { text: "La infraestructura se encuentra en buen estado" },
    { text: "No se encuentra fauna nociva dentro de estancias" },
    { text: "No se encuentran objetos prohibidos dentro de estancias" },
    { text: "En caso de aplicar, la estancia para personas con discapacidad motriz, cumple con lo establecido" },
  ];

  // Checklist for "Área médica" areas
  const areaMedicaChecklist = [
    { text: "Se cuenta con limpieza visual en el área" },
    { text: "Registro de limpieza del área" },
    { text: "La infraestructura se encuentra en buen estado" },
    { text: "Cuenta con lo correspondiente a materia de protección civil (señaléticas, extintores y detector de humo)" },
    { text: "El instrumental médico está en buen estado y bajo llave" },
    { text: "Cuenta con bitácora de esterilización y uso de instrumental médico debidamente llenada" },
    { text: "Cuenta con formato de baja instrumental debidamente llenado" },
    { text: "Los artículos de oficina se encuentran debidamente identificados e inventariados físico visible" },
    { text: "Sin presencia de alimentos, ni residuos de basura" },
    { text: "No se encuentran objetos o artículos personales no autorizados" },
    { text: "Cuentan con los anaqueles y/o archiveros anclados al piso, identificados y en buen estado" },
    { text: "El área dental cuenta su instrumental en buen estado" },
    { text: "El área dental cuenta con limpieza visual en el área" },
    { text: "El área dental cuenta con hoja de atención médica dental" },
    { text: "La infraestructura del área dental se encuentra en buen estado" },
    { text: "El área dental cuenta con lo correspondiente a materia de protección civil (señaléticas, extintores y detector de humo)" },
    { text: "El instrumental médico del área dental está en buen estado y bajo llave" },
    { text: "El área dental cuenta con bitácora de esterilización y uso de instrumental médico debidamente llenada" },
    { text: "El área dental cuenta con formato de baja instrumental debidamente llenado" },
    { text: "Los artículos de oficina del área dental se encuentran debidamente identificados e inventariados físico visible" },
    { text: "Sin presencia de alimentos, ni residuos de basura en área dental" },
    { text: "En área dental no se encuentran objetos o artículos personales no autorizados" },
    { text: "El área dental cuentan con los anaqueles y/o archiveros anclados al piso, identificados y en buen estado" },
    { text: "El área dental cuenta con Kardex de las salidas de su revelador" },
    { text: "El área dental cuenta con su inventario actualizado de forma física." },
    { text: "El área dental cuenta con su registro de limpieza de área" },
    { text: "El área dental cuenta con su aviso de funcionamiento (COFEPRIS)" },
    { text: "El área dental cuenta con sus reguladores sobre banco" },
    { text: "El área de nutrición cuenta con sus réplicas de alimentos en buen estado e inventariados" },
    { text: "El área de nutrición cuenta con su lista de PPL con patologías y orden de dietas" },
    { text: "El área de nutrición cuenta con limpieza visual en el área" },
    { text: "La infraestructura del área de nutrición se encuentra en buen estado" },
    { text: "El área de nutrición cuenta con lo correspondiente a materia de protección civil (señaléticas, extintores y detector de humo)" },
    { text: "Los artículos de oficina del área de nutrición se encuentran debidamente identificados e inventariados físico visible" },
    { text: "Sin presencia de alimentos, ni residuos de basura en área de nutrición" },
    { text: "En área de nutrición no se encuentran objetos o artículos personales no autorizados" },
    { text: "El área de nutrición cuentan con los anaqueles y/o archiveros anclados al piso, identificados y en buen estado" },
    { text: "El área de nutrición cuenta con su inventario actualizado de forma física." },
    { text: "El área de nutrición cuenta con su registro de limpieza de área" },
    { text: "El área de nutrición cuenta con sus reguladores sobre banco" },
    { text: "El área de fisioterapia cuenta con sus compresas frío y caliente en buen estado e inventariados" },
    { text: "El área de fisioterapia cuenta con bitácora de atención médica" },
    { text: "El área de fisioterapia cuenta con limpieza visual en el área" },
    { text: "La infraestructura del área de fisioterapia se encuentra en buen estado" },
    { text: "El área de fisioterapia cuenta con lo correspondiente a materia de protección civil (señaléticas, extintores y detector de humo)" },
    { text: "Los artículos de oficina del área de fisioterapia se encuentran debidamente identificados e inventariados físico visible" },
    { text: "Sin presencia de alimentos, ni residuos de basura en área de fisioterapia" },
    { text: "En área de fisioterapia no se encuentran objetos o artículos personales no autorizados" },
    { text: "El área de fisioterapia cuentan con los anaqueles y/o archiveros anclados al piso, identificados y en buen estado" },
    { text: "El área de fisioterapia cuenta con su inventario actualizado de forma física." },
    { text: "El área de fisioterapia cuenta con su registro de limpieza de área" },
    { text: "El área de fisioterapia cuenta con sus reguladores sobre banco" },
    { text: "El área de telemedicina cuenta con bitácora de atención médica" },
    { text: "El área de telemedicina cuenta con limpieza visual en el área" },
    { text: "La infraestructura del área de telemedicina se encuentra en buen estado" },
    { text: "El área de telemedicina cuenta con lo correspondiente a materia de protección civil (señaléticas, extintores y detector de humo)" },
    { text: "Los artículos de oficina del área de telemedicina se encuentran debidamente identificados e inventariados físico visible" },
    { text: "Sin presencia de alimentos, ni residuos de basura en área de telemedicina" },
    { text: "En área de telemedicina no se encuentran objetos o artículos personales no autorizados" },
    { text: "El área de telemedicina cuentan con los anaqueles y/o archiveros anclados al piso, identificados y en buen estado" },
    { text: "El área de telemedicina cuenta con su inventario actualizado de forma física." },
    { text: "El área de telemedicina cuenta con su registro de limpieza de área" },
    { text: "El área de telemedicina cuenta con sus reguladores sobre banco" },
    { text: "El dispensario cuenta con formato de suministro de medicamento" },
    { text: "El dispensario cuenta con lista de personas con atención especial o crónicos" },
    { text: "El dispensario cuenta con hojas de tratamiento" },
    { text: "El dispensario cuenta con limpieza visual en el área" },
    { text: "La infraestructura del dispensario se encuentra en buen estado" },
    { text: "El dispensario cuenta con lo correspondiente a materia de protección civil (señaléticas, extintores y detector de humo)" },
    { text: "Los artículos de oficina del dispensario se encuentran debidamente identificados e inventariados físico visible" },
    { text: "Sin presencia de alimentos, ni residuos de basura en dispensario" },
    { text: "En dispensario no se encuentran objetos o artículos personales no autorizados" },
    { text: "El dispensario cuentan con los anaqueles y/o archiveros anclados al piso, identificados y en buen estado" },
    { text: "El dispensario cuenta con su inventario actualizado de forma física." },
    { text: "El dispensario cuenta con su registro de limpieza de área" },
    { text: "El dispensario cuenta con sus reguladores sobre banco" },
    { text: "El medicamento del dispensario no se encuentra caducado" },
    { text: "El medicamento del dispensario se encuentran identificados" },
    { text: "El medicamento del dispensario se encuentran semaforizados" },
    { text: "El medicamento controlado del dispensario de acuerdo a clasificación se encuentran bajo llave" },
    { text: "En el dispensario el control de temperatura de los refrigeradores es tomada 3 veces al día y se encuentra dentro de los parámetros" },
    { text: "La temperatura y humedad en el dispensario está dentro de los parámetros" },
    { text: "El carrito de medicamento en todo momento se encuentra bajo llave y en buen estado" },
    { text: "El carrito de medicamento cuenta con registro en bitácora que coincida con el horario de entrega y triage de acuerdo al cronograma" },
    { text: "El carrito de medicamento cuenta con sus formatos de suministro de medicamentos" },
    { text: "El carrito de medicamento cuenta con lista de personas con atención especial o crónicos" },
    { text: "El carrito de medicamento cuenta con hojas de tratamiento" },
    { text: "Sin presencia de alimentos, ni residuos de basura en el carrito de medicamento" },
    { text: "En el carrito de medicamento no se encuentran objetos o artículos personales no autorizados" },
    { text: "El carrito de medicamento cuenta con su inventario actualizado de forma física." },
    { text: "En el carrito de medicamento no se encuentra medicamento caducado" },
    { text: "En el carrito de medicamento se encuentra identificado todo el medicamento" },
    { text: "En el carrito de medicamento se encuentran cerradas las cajas nuevas" },
    { text: "En el carrito de medicamento se encuentra separado por tratamiento" },
  ];


  // Function to initialize spaces, sections, and areas if they don't exist
  const initializeSpacesAndAreas = useCallback(async () => {
    if (db && firebaseUserId) { // Use firebaseUserId for database operations
      const spacesColRef = collection(db, `artifacts/${__app_id}/public/data/spaces`);
      const existingSpaces = await getDocs(spacesColRef);

      if (existingSpaces.empty) {
        console.log("Initializing default spaces and areas with sections...");
        const spaceNames = ["CP1", "CP2", "CP3", "CP4"];
        
        for (const spaceName of spaceNames) {
          const spaceRef = doc(spacesColRef); // Auto-generate ID for space
          await setDoc(spaceRef, {
            name: spaceName,
            createdAt: new Date(),
            createdBy: firebaseUserId,
          });

          let currentSectionsConfig = [
            { name: "Administración", type: "named", areaNames: ["Tóxicos", "Mantenimiento", "Cocina", "Jurídico", "Expedientes", "Áreas técnicas"] },
            { name: "Procesados", type: "named", areaNames: ["Cocinas", "Panadería", "Tortillería", "Taller TP1", "Taller TP2", "Estancias", "Clein", "Infraestructura", "Pedagogía", "Psicología", "Deportes", "Área médica"] },
            { name: "Sentenciados", type: "named", areaNames: ["Cocinas", "Panadería", "Tortillería", "Taller TS1", "Taller TS2", "Taller RS3", "Taller TS4", "Estancias", "Infraestructura", "Teléfonos", "Pedagogía", "Psicología", "Deportes", "Área médica"] }
          ];

          // Areas to be removed from all sections that contain them
          const areasToRemove = ["Clein", "Infraestructura", "Psicología"];

          currentSectionsConfig = currentSectionsConfig.map(section => {
            let newAreaNames = section.areaNames.filter(areaName =>
              !areasToRemove.includes(areaName)
            );

            // Apply space-specific section name changes and filtering
            if (spaceName === "CP2" || spaceName === "CP4") {
              if (section.name === "Administración") {
                return { ...section, name: "Exterior", areaNames: newAreaNames };
              }
              if (section.name === "Procesados") {
                return { ...section, name: "Interior", areaNames: newAreaNames };
              }
              // For CP2/CP4, filter out "Sentenciados" section entirely
              if (section.name === "Sentenciados") {
                return null; // This section will be filtered out later
              }
            }
            return { ...section, areaNames: newAreaNames };
          }).filter(section => section !== null); // Filter out null sections (like "Sentenciados" for CP2/CP4)


          const areasColRef = collection(db, `artifacts/${__app_id}/public/data/spaces/${spaceRef.id}/areas`);
          for (const sectionConfig of currentSectionsConfig) {
            if (sectionConfig.type === "numbered") {
              for (let i = 1; i <= sectionConfig.count; i++) {
                const areaRef = doc(areasColRef);
                const currentAreaName = `${sectionConfig.prefix}${i}`;
                await setDoc(areaRef, {
                  name: currentAreaName, // e.g., Adm1, Sen1
                  section: sectionConfig.name,
                  createdAt: new Date(),
                  createdBy: firebaseUserId,
                  spaceId: spaceRef.id
                });
                // Check if the current area is a workshop area and add default checklist items
                if (workshopAreaNames.includes(currentAreaName)) {
                  const checklistSubColRef = collection(db, `artifacts/${__app_id}/public/data/spaces/${spaceRef.id}/areas/${areaRef.id}/checklistItems`);
                  for (const item of workshopChecklist) {
                    await addDoc(checklistSubColRef, {
                      text: item.text,
                      status: 'pending',
                      observations: '',
                      placeholderImageUrl: null,
                      createdAt: new Date(),
                      addedBy: 'System Init'
                    });
                  }
                }
              }
            } else if (sectionConfig.type === "named") {
              for (const areaName of sectionConfig.areaNames) {
                const areaRef = doc(areasColRef);
                await setDoc(areaRef, {
                  name: areaName, // e.g., Cocinas, Panadería
                  section: sectionConfig.name,
                  createdAt: new Date(),
                  createdBy: firebaseUserId,
                  spaceId: spaceRef.id
                });
                // Check if the current area is a workshop area or "Cocinas" or "Panadería" or "Tortillería" or "Pedagogía" or "Deportes" or "Estancias" or "Área médica" and add appropriate checklist items
                if (workshopAreaNames.includes(areaName)) {
                  const checklistSubColRef = collection(db, `artifacts/${__app_id}/public/data/spaces/${spaceRef.id}/areas/${areaRef.id}/checklistItems`);
                  for (const item of workshopChecklist) {
                    await addDoc(checklistSubColRef, {
                      text: item.text,
                      status: 'pending',
                      observations: '',
                      placeholderImageUrl: null,
                      createdAt: new Date(),
                      addedBy: 'System Init'
                    });
                  }
                } else if (areaName === "Cocinas") { // Apply checklist for "Cocinas"
                  const checklistSubColRef = collection(db, `artifacts/${__app_id}/public/data/spaces/${spaceRef.id}/areas/${areaRef.id}/checklistItems`);
                  for (const item of cocinasChecklist) {
                    await addDoc(checklistSubColRef, {
                      text: item.text,
                      status: 'pending',
                      observations: '',
                      placeholderImageUrl: null,
                      createdAt: new Date(),
                      addedBy: 'System Init'
                    });
                  }
                } else if (areaName === "Panadería") { // Apply checklist for "Panadería"
                  const checklistSubColRef = collection(db, `artifacts/${__app_id}/public/data/spaces/${spaceRef.id}/areas/${areaRef.id}/checklistItems`);
                  for (const item of panaderiaChecklist) {
                    await addDoc(checklistSubColRef, {
                      text: item.text,
                      status: 'pending',
                      observations: '',
                      placeholderImageUrl: null,
                      createdAt: new Date(),
                      addedBy: 'System Init'
                    });
                  }
                } else if (areaName === "Tortillería") { // Apply checklist for "Tortillería"
                  const checklistSubColRef = collection(db, `artifacts/${__app_id}/public/data/spaces/${spaceRef.id}/areas/${areaRef.id}/checklistItems`);
                  for (const item of tortilleriaChecklist) {
                    await addDoc(checklistSubColRef, {
                      text: item.text,
                      status: 'pending',
                      observations: '',
                      placeholderImageUrl: null,
                      createdAt: new Date(),
                      addedBy: 'System Init'
                    });
                  }
                } else if (areaName === "Pedagogía") { // Apply checklist for "Pedagogía"
                  const checklistSubColRef = collection(db, `artifacts/${__app_id}/public/data/spaces/${spaceRef.id}/areas/${areaRef.id}/checklistItems`);
                  for (const item of pedagogiaChecklist) {
                    await addDoc(checklistSubColRef, {
                      text: item.text,
                      status: 'pending',
                      observations: '',
                      placeholderImageUrl: null,
                      createdAt: new Date(),
                      addedBy: 'System Init'
                    });
                  }
                } else if (areaName === "Deportes") { // Apply checklist for "Deportes"
                  const checklistSubColRef = collection(db, `artifacts/${__app_id}/public/data/spaces/${spaceRef.id}/areas/${areaRef.id}/checklistItems`);
                  for (const item of deportesChecklist) {
                    await addDoc(checklistSubColRef, {
                      text: item.text,
                      status: 'pending',
                      observations: '',
                      placeholderImageUrl: null,
                      createdAt: new Date(),
                      addedBy: 'System Init'
                    });
                  }
                } else if (areaName === "Estancias") { // Apply checklist for "Estancias"
                  const checklistSubColRef = collection(db, `artifacts/${__app_id}/public/data/spaces/${spaceRef.id}/areas/${areaRef.id}/checklistItems`);
                  for (const item of estanciasChecklist) {
                    await addDoc(checklistSubColRef, {
                      text: item.text,
                      status: 'pending',
                      observations: '',
                      placeholderImageUrl: null,
                      createdAt: new Date(),
                      addedBy: 'System Init'
                    });
                  }
                } else if (areaName === "Área médica") { // Apply new checklist for "Área médica"
                  const checklistSubColRef = collection(db, `artifacts/${__app_id}/public/data/spaces/${spaceRef.id}/areas/${areaRef.id}/checklistItems`);
                  for (const item of areaMedicaChecklist) {
                    await addDoc(checklistSubColRef, {
                      text: item.text,
                      status: 'pending',
                      observations: '',
                      placeholderImageUrl: null,
                      createdAt: new Date(),
                      addedBy: 'System Init'
                    });
                  }
                }
              }
            }
          }
        }
        console.log("Spaces, sections, and areas initialized!");
      } else {
        console.log("Spaces already exist, skipping initialization.");
      }
    }
  }, [db, firebaseUserId, workshopChecklist, workshopAreaNames, cocinasChecklist, panaderiaChecklist, tortilleriaChecklist, pedagogiaChecklist, deportesChecklist, estanciasChecklist, areaMedicaChecklist]);

  // Fetch Areas when a space is selected
  useEffect(() => {
    if (db && selectedSpace) {
      const areasColRef = collection(db, `artifacts/${__app_id}/public/data/spaces/${selectedSpace.id}/areas`);
      // Ordering by 'createdAt' to ensure consistent display order. Firestore may require an index for this query.
      const q = query(areasColRef, orderBy("createdAt", "asc"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedAreas = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setAreas(fetchedAreas);
      }, (error) => {
        console.error("Error fetching areas:", error);
      });
      return () => unsubscribe();
    } else {
      setAreas([]); // Clear areas if no space is selected
    }
  }, [db, selectedSpace]);

  // Fetch Checklist Items when an area is selected
  useEffect(() => {
    if (db && selectedSpace && selectedArea) {
      const checklistColRef = collection(db, `artifacts/${__app_id}/public/data/spaces/${selectedSpace.id}/areas/${selectedArea.id}/checklistItems`);
      // Ordering by 'createdAt' to ensure consistent display order. Firestore may require an index for this query.
      const q = query(checklistColRef, orderBy("createdAt", "asc"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedItems = snapshot.docs.map(doc => ({
          id: doc.id,
          // Ensure status, observations, and placeholderImageUrl have default values if missing
          status: doc.data().status || 'pending', // 'pending', 'cumple', 'noCumple'
          observations: doc.data().observations || '',
          placeholderImageUrl: doc.data().placeholderImageUrl || null,
          ...doc.data()
        }));
        setChecklistItems(fetchedItems);
      }, (error) => {
        console.error("Error fetching checklist items:", error);
      });
      return () => unsubscribe();
    } else {
      setChecklistItems([]); // Clear checklist items if no area is selected
    }
  }, [db, selectedSpace, selectedArea]);

  // Handle adding a new checklist item
  const handleAddItem = async () => {
    if (db && selectedSpace && selectedArea && newItemText.trim() !== '' && selectedSupervisor) {
      try {
        const checklistColRef = collection(db, `artifacts/${__app_id}/public/data/spaces/${selectedSpace.id}/areas/${selectedArea.id}/checklistItems`);
        await addDoc(checklistColRef, {
          text: newItemText,
          status: 'pending', // Default status for new items
          observations: newObservationText.trim(),
          placeholderImageUrl: selectedImageForNewItem ? `https://placehold.co/100x100/A0B2C3/FFFFFF?text=Evidencia` : null, // Simulated photo
          createdAt: new Date(),
          addedBy: selectedSupervisor // Use selected supervisor name here
        });
        setNewItemText('');
        setNewObservationText('');
        setSelectedImageForNewItem(null); // Clear selected image for new item
      } catch (e) {
        console.error("Error adding checklist item: ", e);
      }
    } else if (!selectedSupervisor) {
        // Custom alert instead of browser alert
        alert("Por favor, selecciona un supervisor antes de añadir un elemento.");
    }
  };

  // Handle updating an existing checklist item (status, observations, or image)
  const handleUpdateChecklistItem = async (itemId, updates) => {
    if (db && selectedSpace && selectedArea && selectedSupervisor) { // Use selectedSupervisor here
      try {
        const itemRef = doc(db, `artifacts/${__app_id}/public/data/spaces/${selectedSpace.id}/areas/${selectedArea.id}/checklistItems`, itemId);

        const dataToUpdate = { ...updates };

        // Handle image file update (simulation)
        if (updates.imageFile) {
          // In a real app, you would upload updates.imageFile to Firebase Storage
          // and then get its URL to store in Firestore.
          // For this simulation, we generate a new placeholder URL.
          dataToUpdate.placeholderImageUrl = `https://placehold.co/100x100/A0B2C3/FFFFFF?text=Evidencia+${Math.floor(Math.random()*1000)}`;
          delete dataToUpdate.imageFile; // Remove the file object as it's not stored directly
        }

        // If status is updated, also record who and when it was completed
        if (updates.status === 'cumple' || updates.status === 'noCumple') {
          dataToUpdate.completedAt = new Date();
          dataToUpdate.completedBy = selectedSupervisor; // Use selected supervisor name here
        } else if (updates.status === 'pending') {
            dataToUpdate.completedAt = null;
            dataToUpdate.completedBy = null;
        }


        await updateDoc(itemRef, dataToUpdate);
      } catch (e) {
        console.error("Error updating checklist item:", e);
      }
    } else if (!selectedSupervisor) {
        // Custom alert instead of browser alert
        alert("Por favor, selecciona un supervisor antes de actualizar un elemento.");
    }
  };

  // Handle deleting a checklist item
  const handleDeleteItem = async (itemId) => {
    if (db && selectedSpace && selectedArea) {
      try {
        const itemRef = doc(db, `artifacts/${__app_id}/public/data/spaces/${selectedSpace.id}/areas/${selectedArea.id}/checklistItems`, itemId);
        await deleteDoc(itemRef);
      } catch (e) {
        console.error("Error deleting checklist item:", e);
      }
    }
  };

  // Handle image selection for NEW item (separate from existing item updates)
  const handleImageChangeForNewItem = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedImageForNewItem(e.target.files[0]); // Corrected: Setting the state
    }
  };

  // Function to reset all checklist item states
  const resetAllChecklistItems = useCallback(async () => {
    if (!db || !firebaseUserId) {
        console.error("Database not ready or user not authenticated to reset items.");
        return;
    }
    console.log("Reiniciando todos los elementos del checklist...");

    try {
        const spacesColRef = collection(db, `artifacts/${__app_id}/public/data/spaces`);
        const spacesSnapshot = await getDocs(spacesColRef);

        for (const spaceDoc of spacesSnapshot.docs) {
            const areasColRef = collection(db, `artifacts/${__app_id}/public/data/spaces/${spaceDoc.id}/areas`);
            const areasSnapshot = await getDocs(areasColRef);

            for (const areaDoc of areasSnapshot.docs) {
                const checklistColRef = collection(db, `artifacts/${__app_id}/public/data/spaces/${spaceDoc.id}/areas/${areaDoc.id}/checklistItems`);
                const checklistSnapshot = await getDocs(checklistColRef);

                for (const itemDoc of checklistSnapshot.docs) {
                    const itemRef = doc(checklistColRef, itemDoc.id);
                    await updateDoc(itemRef, {
                        status: 'pending',
                        observations: '',
                        placeholderImageUrl: null,
                        completedAt: null,
                        completedBy: null,
                    });
                }
            }
        }
        console.log("Todos los elementos del checklist han sido reiniciados.");
    } catch (error) {
        console.error("Error al reiniciar los elementos del checklist:", error);
    }
  }, [db, firebaseUserId]);


  // Prepare data for the report
  const generateReportData = useCallback(async () => {
    if (db && firebaseUserId) { // Use firebaseUserId for database operations
      const reportData = [];
      
      // Accumulators for the first chart (filtered by selectedSpace, INCLUDING pending)
      let totalCumpleSelectedSpace = 0;
      let totalNoCumpleSelectedSpace = 0;
      let totalPendingSelectedSpace = 0; 

      // Accumulators for the second chart (global, only completed)
      let totalCumpleCompletedOnly = 0;
      let totalNoCumpleCompletedOnly = 0;


      const spacesColRef = collection(db, `artifacts/${__app_id}/public/data/spaces`);
      const allSpacesSnapshot = await getDocs(spacesColRef);

      for (const spaceDoc of allSpacesSnapshot.docs) {
        const space = { id: spaceDoc.id, ...spaceDoc.data(), sections: [] };
        const areasColRef = collection(db, `artifacts/${__app_id}/public/data/spaces/${space.id}/areas`);
        const allAreasSnapshot = await getDocs(areasColRef);

        const areasInSpace = allAreasSnapshot.docs.map(areaDoc => ({
          id: areaDoc.id,
          ...areaDoc.data(),
          checklistItems: []
        }));

        // Get unique section names for the current space and sort them
        const uniqueSectionNames = [...new Set(areasInSpace.map(area => area.section))].sort();

        const areasBySection = areasInSpace.reduce((acc, area) => {
          (acc[area.section] = acc[area.section] || []).push(area);
          return acc;
        }, {});

        for (const sectionName of uniqueSectionNames) { // Iterate over dynamic section names
          const currentSectionAreas = areasBySection[sectionName] || [];
          if (currentSectionAreas.length > 0) {
            const sectionReport = { name: sectionName, areas: [] };
            for (const area of currentSectionAreas) {
              const checklistColRef = collection(db, `artifacts/${__app_id}/public/data/spaces/${space.id}/areas/${area.id}/checklistItems`);
              const allChecklistItemsSnapshot = await getDocs(checklistColRef);

              const allItemsInArea = allChecklistItemsSnapshot.docs.map(itemDoc => ({
                id: itemDoc.id,
                status: itemDoc.data().status || 'pending',
                observations: itemDoc.data().observations || '',
                placeholderImageUrl: itemDoc.data().placeholderImageUrl || null,
                ...itemDoc.data()
              }));

              // Filter checklist items for display in the WRITTEN REPORT to only include 'noCumple'
              const noCumpleItemsForReport = allItemsInArea.filter(item => item.status === 'noCumple');

              // Accumulate for the GLOBAL "completed only" chart (always count all completed items)
              allItemsInArea.forEach(item => {
                if (item.status === 'cumple') {
                  totalCumpleCompletedOnly++;
                } else if (item.status === 'noCumple') {
                  totalNoCumpleCompletedOnly++;
                }
              });

              // Accumulate for the "selected space" chart (INCLUDING pendientes)
              if (selectedSpace && space.id === selectedSpace.id) {
                allItemsInArea.forEach(item => {
                  if (item.status === 'cumple') {
                    totalCumpleSelectedSpace++;
                  } else if (item.status === 'noCumple') {
                    totalNoCumpleSelectedSpace++;
                  } else if (item.status === 'pending') { // Include pending for this specific chart
                    totalPendingSelectedSpace++;
                  }
                });
              }

              // Only add area to reportData if it has at least one "No Cumple" item for the report
              if (noCumpleItemsForReport.length > 0) {
                // Assign only the 'No Cumple' items to the area for the report
                area.checklistItems = noCumpleItemsForReport; // Overwrite for report display
                sectionReport.areas.push(area);
              }
            }
            // Only add section to reportData if it contains any areas with "No Cumple" items
            if (sectionReport.areas.length > 0) {
              space.sections.push(sectionReport);
            }
          }
        }
        // Only add space to reportData if it contains any sections with areas that have "No Cumple" items
        if (space.sections.length > 0) {
          reportData.push(space);
        }
      }

      // First Pie Chart: Filtered by selectedSpace, INCLUDES pending
      const currentSpaceTotalDisplayItems = totalCumpleSelectedSpace + totalNoCumpleSelectedSpace + totalPendingSelectedSpace;
      const pieChartDataForSelectedSpace = [
          { name: 'Cumple', value: totalCumpleSelectedSpace, color: '#10B981' }, // green-500
          { name: 'No Cumple', value: totalNoCumpleSelectedSpace, color: '#EF4444' }, // red-500
          { name: 'Pendiente', value: totalPendingSelectedSpace, color: '#F59E0B' } // yellow-500
      ];
      setPieChartStats({ totalItems: currentSpaceTotalDisplayItems, data: pieChartDataForSelectedSpace });

      // Second Pie Chart: Global, only completed items
      const totalCompletedItems = totalCumpleCompletedOnly + totalNoCumpleCompletedOnly;
      const pieChartDataCompleted = [
          { name: 'Cumple', value: totalCumpleCompletedOnly, color: '#10B981' }, // green-500
          { name: 'No Cumple', value: totalNoCumpleCompletedOnly, color: '#EF4444' }, // red-500
      ];
      setPieChartCompletedStats({ totalItems: totalCompletedItems, data: pieChartDataCompleted });

      setAllSupervisedAreas(reportData);
      setShowReport(true);
    }
  }, [db, firebaseUserId, selectedSpace]); // Add selectedSpace to useCallback dependencies

  // Print the report (also used for "Save as PDF" via browser's print dialog)
  const handlePrintReport = () => {
    window.print();
  };

  // Handle "Finalizar Supervisión" button click
  const handleFinishSupervision = () => {
    setModalMessage("¿Estás seguro de que quieres finalizar la supervisión del día? Se generará el reporte, se guardará como PDF (usando la función de impresión del navegador), y todos los elementos del checklist se reiniciarán a 'Pendiente'.");
    setShowConfirmationModal(true);
  };

  // Confirm and proceed with finishing supervision
  const confirmFinishSupervision = async () => {
    setShowConfirmationModal(false);
    await generateReportData(); // Generate report data first
    // Small delay to ensure report UI renders before print dialog
    setTimeout(async () => {
        handlePrintReport(); // Trigger print dialog, user can select "Save as PDF"
        await resetAllChecklistItems(); // Reset data in Firestore
        setSelectedSpace(null); // Clear selected space in UI
        setSelectedArea(null); // Clear selected area in UI
        // We stay on the report page, user needs to click "Volver a la Supervisión" to go back to selection
    }, 500); // 500ms delay
  };

  // Main UI rendering logic
  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
        <div className="text-xl font-semibold text-gray-700">Cargando aplicación y autenticando...</div>
      </div>
    );
  }

  // --- Supervisor Selection Screen ---
  if (!selectedSupervisor) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4 font-inter antialiased">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <h1 className="text-3xl font-extrabold text-indigo-700 mb-6">Selecciona tu Usuario</h1>
          <p className="text-gray-600 mb-6">Por favor, elige tu nombre para comenzar la supervisión.</p>
          <div className="grid grid-cols-1 gap-4">
            {supervisors.map((supervisor, index) => (
              <button
                key={index}
                onClick={() => setSelectedSupervisor(supervisor)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300 ease-in-out transform hover:scale-105 shadow-lg"
              >
                {supervisor}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- Confirmation Modal ---
  if (showConfirmationModal) {
    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 shadow-2xl text-center max-w-sm mx-auto">
          <p className="text-lg font-semibold text-gray-800 mb-6">{modalMessage}</p>
          <div className="flex justify-center gap-4">
            <button
              onClick={confirmFinishSupervision}
              className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300 ease-in-out shadow-md"
            >
              Confirmar
            </button>
            <button
              onClick={() => setShowConfirmationModal(false)}
              className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-300 ease-in-out shadow-md"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }


  // --- Report View ---
  if (showReport) {
    return (
      <div className="min-h-screen bg-white p-6 font-inter antialiased print:p-0">
        <div className="max-w-4xl mx-auto print:max-w-full">
          <div className="flex justify-between items-center mb-8 print:hidden">
            <h1 className="text-3xl font-extrabold text-indigo-700">Reporte de Supervisión</h1>
            <button
              onClick={() => setShowReport(false)}
              className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-300 ease-in-out shadow-md"
            >
              Volver a la Supervisión
            </button>
            <button
              onClick={handlePrintReport}
              className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300 ease-in-out transform hover:scale-105 shadow-md flex items-center"
            >
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 002 2v4a2 2 0 002-2V6a2 2 0 00-2-2H4zm0 10v4a2 2 0 002 2h8a2 2 0 002-2v-4H4zm0 0h12" clipRule="evenodd" fillRule="evenodd"></path></svg>
              Guardar Reporte (PDF)
            </button>
          </div>

          <div className="mb-8 flex flex-wrap justify-center gap-8 print:hidden">
              {/* Gráfica de Resumen General (filtrada por espacio supervisado, incluye pendientes) */}
              {selectedSpace ? (
                  <PieChart data={pieChartStats.data} totalItems={pieChartStats.totalItems} title={`Resumen de Cumplimiento (${selectedSpace.name})`} />
              ) : (
                  <div className="flex flex-col items-center p-4 bg-white rounded-lg shadow-md print:shadow-none print:border print:p-2">
                      <h3 className="text-xl font-bold text-gray-700 mb-4">Resumen de Cumplimiento</h3>
                      <p className="text-center text-gray-500 mt-4 text-sm">Selecciona un espacio para ver este resumen.</p>
                  </div>
              )}
              {/* Gráfica de Cumplimiento de Ítems Completados (global, excluye pendientes) */}
              {pieChartCompletedStats.totalItems > 0 && (
                <PieChart data={pieChartCompletedStats.data} totalItems={pieChartCompletedStats.totalItems} title="Cumplimiento de Ítems Completados (Global)" />
              )}
          </div>


          {allSupervisedAreas.length === 0 ? (
            <p className="text-center text-gray-600 italic py-10">No hay datos de supervisión para el reporte o todos los elementos están pendientes.</p>
          ) : (
            allSupervisedAreas.map(space => (
              <div key={space.id} className="mb-10 p-6 border border-indigo-200 rounded-lg shadow-lg bg-white print:border print:shadow-none print:mb-6">
                <h2 className="text-3xl font-bold text-indigo-800 mb-4 pb-2 border-b border-indigo-300">{space.name}</h2>
                {/* Group areas by section within the report */}
                {space.sections.map(section => (
                  <div key={`${space.id}-${section.name}`} className="mb-8">
                    <h3 className="text-2xl font-semibold text-indigo-700 mb-4 border-b pb-2">{section.name}</h3> {/* Section header */}
                    {section.areas.map(area => (
                      <div key={area.id} className="mb-8 p-5 bg-indigo-50 rounded-lg shadow-inner print:bg-white print:p-4 print:mb-4 print:border">
                        <h4 className="text-xl font-semibold text-indigo-600 mb-3">{area.name}</h4> {/* Area header */}
                        {area.checklistItems.length > 0 ? (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {area.checklistItems.map(item => (
                              <div key={item.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col print:border print:shadow-none print:p-3">
                                <p className="font-medium text-lg text-gray-800 flex items-center">
                                  {item.status === 'cumple' && (
                                    <svg className="w-6 h-6 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                  )}
                                  {item.status === 'noCumple' && (
                                    <svg className="w-6 h-6 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                  )}
                                  {item.status === 'pending' && (
                                    <svg className="w-6 h-6 text-yellow-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                  )}
                                  <span className={`${item.status !== 'pending' ? 'line-through text-gray-500' : ''}`}>{item.text}</span>
                                </p>
                                {item.observations && (
                                  <p className="text-sm text-gray-600 mt-2 ml-8 italic">Observaciones: "{item.observations}"</p>
                                )}
                                {item.placeholderImageUrl && (
                                  <div className="mt-4 flex flex-col items-start ml-8">
                                    <span className="text-xs text-gray-500 mb-1">Evidencia Fotográfica (Simulada):</span>
                                    <img
                                      src={item.placeholderImageUrl}
                                      alt="Evidencia (Simulada)"
                                      className="w-32 h-32 object-cover rounded-md border border-gray-300 shadow-sm print:w-32 print:h-32" // Increased size
                                      onError={(e) => { e.target.onerror = null; e.target.src = "https://placehold.co/100x100/CCCCCC/888888?text=Error"; }}
                                    />
                                  </div>
                                )}
                                 {/* Display Supervision Date and Supervisor */}
                                 {item.completedBy && item.completedAt && (
                                    <p className="text-xs text-gray-400 mt-2 ml-8">
                                        Completado por: <span className="font-semibold">{item.completedBy}</span> el <span className="font-semibold">{item.completedAt.seconds ? new Date(item.completedAt.seconds * 1000).toLocaleString() : 'N/A'}</span>
                                    </p>
                                )}
                                {item.addedBy && (
                                    <p className="text-xs text-gray-400 mt-1 ml-8">Agregado por: <span className="font-semibold">{item.addedBy}</span></p>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-gray-500 italic">No hay elementos de checklist para esta área.</p>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // --- Main Supervision View ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 font-inter antialiased">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden md:p-8 p-4">
        <h1 className="text-4xl font-extrabold text-center text-indigo-700 mb-8 pt-4">
          Sistema de Supervisión
        </h1>

        {/* Display selected supervisor for easy identification */}
        <div className="bg-blue-100 text-blue-800 text-sm p-3 rounded-lg mb-6 text-center shadow-inner">
            <p>Supervisor Seleccionado: <span className="font-bold">{selectedSupervisor}</span></p>
            {/* FIX: Add null check for firebaseUserId before using substring */}
            <p className="mt-1">ID de Sesión: <span className="font-mono font-bold break-all">{firebaseUserId ? firebaseUserId.substring(0, 8) + '...' : 'Cargando...'}</span></p>
        </div>


        {/* Navigation and Report Button */}
        <div className="flex flex-wrap gap-3 mb-8 items-center justify-center p-4 bg-gray-50 rounded-xl shadow-inner">
            <button
                onClick={() => { setSelectedSpace(null); setSelectedArea(null); }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-5 rounded-lg transition duration-300 ease-in-out transform hover:scale-105 shadow-md flex items-center disabled:opacity-50"
                disabled={!selectedSpace && !selectedArea}
            >
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M11.707 3.293a1 1 0 010 1.414L7.414 9l4.293 4.293a1 1 0 01-1.414 1.414l-5-5a1 1 0 010-1.414l5-5a1 1 0 011.414 0z" clipRule="evenodd"></path></svg>
                Volver a Espacios
            </button>
            <button
                onClick={generateReportData}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-5 rounded-lg transition duration-300 ease-in-out transform hover:scale-105 shadow-md flex items-center"
            >
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M10 3a1 1 0 00-.707.293l-5 5a1 1 0 000 1.414l5 5a1 1 0 001.414-1.414L6.414 10l4.293-4.293A1 1 0 0010 3z" clipRule="evenodd" fillRule="evenodd"></path></svg>
                Generar Reporte (PDF)
            </button>
            <button
                onClick={handleFinishSupervision}
                className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-5 rounded-lg transition duration-300 ease-in-out transform hover:scale-105 shadow-md flex items-center"
            >
                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"></path></svg>
                Finalizar Supervisión
            </button>
            {spaces.length === 0 && (
                <button
                    onClick={initializeSpacesAndAreas}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-5 rounded-lg transition duration-300 ease-in-out transform hover:scale-105 shadow-md flex items-center"
                >
                    <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M11 3a1 1 0 00-1 1v5h5a1 1 0 000-2h-4V4a1 1 0 00-1-1z" clipRule="evenodd" fillRule="evenodd"></path></svg>
                    Inicializar Espacios y Áreas
                </button>
            )}
        </div>


        {/* Display Spaces */}
        {!selectedSpace && (
          <div className="p-6 bg-white rounded-xl shadow-md">
            <h2 className="text-2xl font-bold text-indigo-600 mb-4">Selecciona un Espacio</h2>
            {spaces.length === 0 ? (
              <p className="text-gray-500 italic text-center py-8">
                No hay espacios disponibles. Por favor, haz clic en "Inicializar Espacios y Áreas" si es la primera vez.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {spaces.map(space => (
                  <button
                    key={space.id}
                    onClick={() => setSelectedSpace(space)}
                    className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-4 px-6 rounded-xl transition duration-300 ease-in-out transform hover:scale-105 shadow-lg"
                  >
                    {space.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Display Areas for selected space, grouped by section */}
        {selectedSpace && !selectedArea && (
          <div className="p-6 bg-white rounded-xl shadow-md">
            <h2 className="text-2xl font-bold text-indigo-600 mb-4">Áreas en {selectedSpace.name}</h2>
            {/* Group areas by section */}
            {Object.entries(
              areas.reduce((acc, area) => {
                (acc[area.section] = acc[area.section] || []).push(area);
                return acc;
              }, {})
            ).map(([sectionName, sectionAreas]) => (
              <div key={sectionName} className="mb-6">
                <h3 className="text-xl font-semibold text-indigo-700 mb-3 border-b pb-2">{sectionName}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {sectionAreas.map(area => (
                    <button
                      key={area.id}
                      onClick={() => setSelectedArea(area)}
                      className="bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold py-3 px-4 rounded-lg transition duration-300 ease-in-out transform hover:-translate-y-0.5 shadow-md"
                    >
                      {area.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Display Checklist for selected area */}
        {selectedSpace && selectedArea && (
          <div className="p-6 bg-white rounded-xl shadow-md">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-indigo-600">Checklist para {selectedArea.name} ({selectedArea.section} - {selectedSpace.name})</h2>
                <button
                    onClick={() => setSelectedArea(null)} // Set selectedArea to null to go back to areas list
                    className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-300 ease-in-out shadow-md flex items-center"
                >
                    <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M11.707 3.293a1 1 0 010 1.414L7.414 9l4.293 4.293a1 1 0 01-1.414 1.414l-5-5a1 1 0 010-1.414l5-5a1 1 0 011.414 0z" clipRule="evenodd"></path></svg>
                    Regresar
                </button>
            </div>

            {/* Add New Checklist Item Section */}
            <div className="mb-8 p-6 bg-indigo-50 rounded-xl shadow-md">
              <h3 className="text-xl font-bold text-indigo-700 mb-3">Añadir Nuevo Elemento</h3>
              <input
                type="text"
                className="w-full p-3 border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-transparent mb-3 text-gray-700"
                placeholder="Descripción del elemento del checklist..."
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
              />
              <textarea
                className="w-full p-3 border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:border-transparent mb-3 text-gray-700 resize-y"
                placeholder="Observaciones (opcional)..."
                rows="2"
                value={newObservationText}
                onChange={(e) => setNewObservationText(e.target.value)}
              ></textarea>
              <div className="flex items-center gap-3 mb-4">
                <label className="cursor-pointer bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition duration-300 ease-in-out transform hover:-translate-y-1 shadow-lg flex items-center justify-center">
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-4 4 4 4-4V5h-4L9 9 5 5h-1v10zm1-7a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"></path></svg>
                  Adjuntar Foto
                  <input type="file" accept="image/*" onChange={handleImageChangeForNewItem} className="hidden" />
                </label>
                {selectedImageForNewItem && (
                  <span className="text-sm text-gray-600">Archivo seleccionado: {selectedImageForNewItem.name}</span>
                )}
              </div>
              <button
                onClick={handleAddItem}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg transition duration-300 ease-in-out transform hover:scale-105 shadow-xl flex items-center justify-center"
              >
                <svg className="w-6 h-6 mr-2" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path></svg>
                Añadir Elemento
              </button>
              <p className="text-center text-sm text-gray-500 mt-4">
                <span className="font-bold">Nota sobre las fotos:</span> Se usará un marcador de posición.
              </p>
            </div>

            {/* Checklist Items Display */}
            <div>
              {checklistItems.length === 0 ? (
                <p className="text-gray-500 italic text-center py-8">No hay elementos en este checklist aún. Añade uno.</p>
              ) : (
                <ul className="space-y-4">
                  {checklistItems.map(item => (
                    <li
                      key={item.id}
                      className={`flex flex-col p-4 rounded-lg shadow-sm transition duration-200 ease-in-out transform ${
                        item.status === 'cumple' ? 'bg-green-50' : item.status === 'noCumple' ? 'bg-red-50' : 'bg-blue-50 hover:shadow-md'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-lg font-medium flex-grow ${item.status !== 'pending' ? 'line-through text-gray-500' : 'text-gray-800'}`}>
                          {item.text}
                        </span>
                        <div className="flex space-x-2 ml-4">
                          <button
                            onClick={() => handleUpdateChecklistItem(item.id, { status: 'cumple' })}
                            className={`px-3 py-1 rounded-md text-sm font-semibold transition duration-200 ${
                              item.status === 'cumple' ? 'bg-green-600 text-white' : 'bg-green-200 text-green-800 hover:bg-green-300'
                            }`}
                          >
                            Cumple
                          </button>
                          <button
                            onClick={() => handleUpdateChecklistItem(item.id, { status: 'noCumple' })}
                            className={`px-3 py-1 rounded-md text-sm font-semibold transition duration-200 ${
                              item.status === 'noCumple' ? 'bg-red-600 text-white' : 'bg-red-200 text-red-800 hover:bg-red-300'
                            }`}
                          >
                            No Cumple
                          </button>
                          <button
                            onClick={() => handleUpdateChecklistItem(item.id, { status: 'pending' })}
                            className={`px-3 py-1 rounded-md text-sm font-semibold transition duration-200 ${
                              item.status === 'pending' ? 'bg-yellow-600 text-white' : 'bg-yellow-200 text-yellow-800 hover:bg-yellow-300'
                            }`}
                          >
                            Pendiente
                          </button>
                        </div>
                      </div>

                      {/* Observations and Image for Existing Item */}
                      <div className="mt-2 p-3 bg-white rounded-md border border-gray-200 shadow-sm">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones:</label>
                        <textarea
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-1 focus:ring-indigo-400 focus:border-transparent text-gray-700 resize-y"
                          placeholder="Añadir observaciones..."
                          rows="2"
                          value={item.observations || ''}
                          onChange={(e) => handleUpdateChecklistItem(item.id, { observations: e.target.value })}
                        ></textarea>

                        <div className="mt-3 flex items-center justify-between">
                            <label className="cursor-pointer bg-blue-400 hover:bg-blue-500 text-white font-bold py-2 px-3 rounded-lg text-sm transition duration-300 ease-in-out transform hover:scale-105 flex items-center justify-center">
                              <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-4 4 4 4-4V5h-4L9 9 5 5h-1v10zm1-7a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"></path></svg>
                              Adjuntar/Cambiar Foto
                              <input type="file" accept="image/*" onChange={(e) => handleUpdateChecklistItem(item.id, { imageFile: e.target.files[0] })} className="hidden" />
                            </label>
                            {item.placeholderImageUrl && (
                              <div className="flex flex-col items-center ml-2">
                                <img
                                  src={item.placeholderImageUrl}
                                  alt="Evidencia (Simulada)"
                                  className="w-12 h-12 object-cover rounded-md border border-gray-200 shadow-sm"
                                  onError={(e) => { e.target.onerror = null; e.target.src = "https://placehold.co/100x100/CCCCCC/888888?text=Error"; }}
                                />
                                <span className="text-xs text-gray-500 mt-1">Evidencia Actual</span>
                              </div>
                            )}
                        </div>
                      </div>

                      <div className="mt-3 flex justify-between items-center text-xs text-gray-400">
                          <span>Agregado por: <span className="font-semibold">{item.addedBy || 'Desconocido'}</span></span>
                          {item.completedBy && item.completedAt && (
                              <span className="ml-2">Completado por: <span className="font-semibold">{item.completedBy}</span> el <span className="font-semibold">{item.completedAt.seconds ? new Date(item.completedAt.seconds * 1000).toLocaleString() : 'N/A'}</span></span>
                          )}
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="bg-red-500 hover:bg-red-600 text-white py-1 px-2 rounded-md transition duration-300 ease-in-out transform hover:scale-105 shadow-sm flex items-center justify-center"
                          >
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd"></path></svg>
                          </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
      <script src="https://cdn.tailwindcss.com"></script>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>
        {`
        body { font-family: 'Inter', sans-serif; }
        /* Print styles */
        @media print {
            body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .print\\:p-0 { padding: 0 !important; }
            .print\\:max-w-full { max-width: 100% !important; }
            .print\\:hidden { display: none !important; }
            .print\\:mb-6 { margin-bottom: 1.5rem !important; }
            .print\\:bg-white { background-color: white !important; }
            .print\\:p-4 { padding: 1rem !important; }
            .print\\:border { border: 1px solid #e2e8f0 !important; } /* Tailwind gray-200 */
            .print\\:shadow-none { box-shadow: none !important; }
            /* Adjusted size for print images */
            .print\\:w-32 { width: 8rem !important; } /* 128px */
            .print\\:h-32 { height: 8rem !important; } /* 128px */
        }
        `}
      </style>
    </div>
  );
}
export default App;