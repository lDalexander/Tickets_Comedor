import streamlit as st
import mysql.connector
import pandas as pd
from datetime import datetime
import warnings

# --- VARIABLES GLOBALES ---
VARIABLES = {
    'NOMBRE_SERVIDOR': 'SERVER DETCUADOR',
    'AUTOR': 'JOHN GARCIA',
    'ANIO': '2026'
}

# --- SILENCIAR ADVERTENCIAS ---
warnings.filterwarnings('ignore', category=UserWarning, module='pandas')

# --- CONFIGURACIÓN DE PÁGINA ---
st.set_page_config(
    page_title="Reportes Comedor",
    page_icon="🍽️",
    layout="centered"
)

import os
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURACIÓN BASE DE DATOS ---
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'user': os.getenv('DB_USER', 'root'),
    'password': os.getenv('DB_PASSWORD', ''), 
    'database': os.getenv('DB_NAME', 'control_comedor'),
    'port': int(os.getenv('DB_PORT', 3306)),
    'connect_timeout': 10
}

# --- FUNCIÓN BACKEND (Con la corrección de Hora y Fecha) ---
# --- FUNCIÓN BACKEND BLINDADA (SIN SIMBOLOS %) ---
@st.cache_data(show_spinner=False, ttl=10)
def obtener_datos(fecha_inicio, fecha_fin):
    conn = None
    try:
        conn = mysql.connector.connect(**DB_CONFIG)
        
        start_datetime = datetime.combine(fecha_inicio, datetime.min.time())
        end_datetime = datetime.combine(fecha_fin, datetime.max.time())
        
        # TRUCO DE SENIOR:
        # Usamos CAST(hora AS CHAR). 
        # Esto convierte la hora a texto "11:22:38" directo en SQL.
        # Al no usar comillas ni %, Python no se confunde nunca.
        query = """
            SELECT 
                user_id, 
                nombre, 
                fecha, 
                CAST(hora AS CHAR) as hora, 
                descripcion 
            FROM registros 
            WHERE fecha BETWEEN %s AND %s
            ORDER BY fecha DESC, hora DESC
        """
        
        df = pd.read_sql(query, conn, params=(start_datetime, end_datetime))
        return df

    except mysql.connector.Error as err:
        st.error(f"❌ Error de Base de Datos: {err}")
        return pd.DataFrame()
    finally:
        if conn and conn.is_connected():
            conn.close()

# --- INTERFAZ DE USUARIO ---
def main():
    st.title("🍽️ Control de Comedor")
    st.markdown(f"### 📊 Panel de Reportes - {VARIABLES['NOMBRE_SERVIDOR']}")
    
    if 'buscar_realizado' not in st.session_state:
        st.session_state.buscar_realizado = False

    # 1. Sidebar
    with st.sidebar:
        st.header("Filtros de Búsqueda")
        
        fecha_hoy = datetime.now().date()
        col1, col2 = st.columns(2)
        with col1:
            f_inicio = st.date_input("Desde", fecha_hoy)
        with col2:
            f_fin = st.date_input("Hasta", fecha_hoy)
            
        if st.button("🔍 Buscar Registros", type="primary"):
            st.session_state.buscar_realizado = True
            st.cache_data.clear() # Limpia caché al buscar para asegurar datos nuevos

    # 2. Lógica Principal
    if st.session_state.buscar_realizado:
        if f_inicio > f_fin:
            st.warning("⚠️ La fecha de inicio no puede ser mayor a la fecha final.")
        else:
            with st.spinner('Consultando base de datos...'):
                df_resultado = obtener_datos(f_inicio, f_fin)
            
            if not df_resultado.empty:
                # --- METRICAS ---
                st.markdown("---")
                m1, m2, m3 = st.columns(3)
                m1.metric("Total Registros", len(df_resultado))
                m2.metric("Fecha Inicio", str(f_inicio))
                m3.metric("Fecha Fin", str(f_fin))
                st.markdown("---")

                # --- TABLA ---
                st.success("✅ Datos cargados correctamente.")
                
                # Mostramos la tabla (Ahora la columna 'hora' se verá perfecta)
                st.dataframe(df_resultado, hide_index=True, use_container_width=True) 
                
                # --- DESCARGA ---
                csv = df_resultado.to_csv(index=False, sep=';', encoding='utf-8-sig')
                nombre_archivo = f"Reporte_Comedor_{f_inicio}_{f_fin}.csv"
                
                st.download_button(
                    label="📥 Descargar Reporte CSV",
                    data=csv,
                    file_name=nombre_archivo,
                    mime='text/csv'
                )
            else:
                st.info("No se encontraron registros en las fechas seleccionadas.")

    # Footer
    st.markdown("---")
    st.markdown(
        f"""
        <div style="text-align: center; color: grey; font-size: 12px;">
            POWERED BY <b>{VARIABLES['AUTOR']}</b> | 
            Conectado a: {VARIABLES['NOMBRE_SERVIDOR']} | 
            {VARIABLES['ANIO']} © Todos los derechos reservados.
        </div>
        """, 
        unsafe_allow_html=True
    )

if __name__ == "__main__":
    main()