-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Servidor: 127.0.0.1
-- Tiempo de generación: 30-01-2026 a las 22:27:44
-- Versión del servidor: 10.4.32-MariaDB
-- Versión de PHP: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Base de datos: `integracion_erp_db`
--

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `items`
--

CREATE TABLE `items` (
  `id` int(11) NOT NULL,
  `numero_orden` varchar(50) DEFAULT NULL,
  `orden_id` int(11) DEFAULT NULL,
  `codigo_pdf` varchar(50) DEFAULT NULL,
  `codigo_erp` varchar(50) DEFAULT NULL,
  `descripcion` varchar(255) DEFAULT NULL,
  `cantidad` float DEFAULT NULL,
  `costo_unitario` float DEFAULT NULL,
  `costo_total` float DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `items`
--

INSERT INTO `items` (`id`, `numero_orden`, `orden_id`, `codigo_pdf`, `codigo_erp`, `descripcion`, `cantidad`, `costo_unitario`, `costo_total`) VALUES
(15, '4500178768', 8, '40001547', 'DESDICT1L', 'DESINFECTANTE EUCALIP/CITRONE DIAMA DIAMAN 15', 4320, 0.595333, 2571.84),
(16, '4500178768', 8, '40001666', 'LAVDIA500', 'LAVAVAJILLA LÍQUIDO LIMÓN DIAMANT 5 DIAMAN 24', 2304, 0.49, 1128.96);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `map_productos`
--

CREATE TABLE `map_productos` (
  `codigo_pdf` varchar(50) NOT NULL,
  `codigo_erp` varchar(50) NOT NULL,
  `unidades_por_caja` int(11) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `map_productos`
--

INSERT INTO `map_productos` (`codigo_pdf`, `codigo_erp`, `unidades_por_caja`) VALUES
('40000202001', 'DETTLLL1K', 20),
('40000202002', 'DETTLLF1K', 20),
('40000204', 'SUATLL1L', 12),
('40001060', 'LAVDIN500', 24),
('40001547', 'DESDICT1L', 15),
('40001666', 'LAVDIA500', 24),
('40003305', 'SUATLAV1LT', 12);

-- --------------------------------------------------------

--
-- Estructura de tabla para la tabla `ordenes`
--

CREATE TABLE `ordenes` (
  `id` int(11) NOT NULL,
  `numero_orden` varchar(50) NOT NULL,
  `fecha_emision` varchar(20) DEFAULT NULL,
  `proveedor_nombre` varchar(150) DEFAULT NULL,
  `proveedor_ruc` varchar(20) DEFAULT NULL,
  `proveedor_direccion` text DEFAULT NULL,
  `direccion_entrega` text DEFAULT NULL,
  `fecha_entrega` varchar(50) DEFAULT NULL,
  `subtotal` float DEFAULT NULL,
  `iva` float DEFAULT NULL,
  `total` float DEFAULT NULL,
  `created_at` datetime DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Volcado de datos para la tabla `ordenes`
--

INSERT INTO `ordenes` (`id`, `numero_orden`, `fecha_emision`, `proveedor_nombre`, `proveedor_ruc`, `proveedor_direccion`, `direccion_entrega`, `fecha_entrega`, `subtotal`, `iva`, `total`, `created_at`) VALUES
(8, '4500178768', '2025-03-12', 'TIENDAS TUTI', '0993152161001', '', 'KM 19 VIA A LA COSTA', '2025-03-18', 3700.8, 555.12, 4255.92, '2026-01-20 16:59:48');

--
-- Índices para tablas volcadas
--

--
-- Indices de la tabla `items`
--
ALTER TABLE `items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `orden_id` (`orden_id`);

--
-- Indices de la tabla `map_productos`
--
ALTER TABLE `map_productos`
  ADD PRIMARY KEY (`codigo_pdf`);

--
-- Indices de la tabla `ordenes`
--
ALTER TABLE `ordenes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `numero_orden` (`numero_orden`);

--
-- AUTO_INCREMENT de las tablas volcadas
--

--
-- AUTO_INCREMENT de la tabla `items`
--
ALTER TABLE `items`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=17;

--
-- AUTO_INCREMENT de la tabla `ordenes`
--
ALTER TABLE `ordenes`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- Restricciones para tablas volcadas
--

--
-- Filtros para la tabla `items`
--
ALTER TABLE `items`
  ADD CONSTRAINT `items_ibfk_1` FOREIGN KEY (`orden_id`) REFERENCES `ordenes` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
