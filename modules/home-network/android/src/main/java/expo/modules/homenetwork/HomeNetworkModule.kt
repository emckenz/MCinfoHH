package expo.modules.homenetwork

import android.Manifest
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.usb.UsbManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketTimeoutException
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLSocket
import kotlin.math.min

class HomeNetworkModule : Module() {
  private val sessions = ConcurrentHashMap<String, SocketSession>()
  private val mainHandler = Handler(Looper.getMainLooper())

  override fun definition() = ModuleDefinition {
    Name("HomeNetwork")

    AsyncFunction("getActiveNetwork") {
      readActiveNetwork()
    }

    AsyncFunction("udpCollect") { hosts: List<String>, port: Int, payloadBase64: String, timeoutMs: Int ->
      collectUdp(hosts, port, payloadBase64, timeoutMs.coerceIn(300, 8_000))
    }

    AsyncFunction("tcpExchange") { host: String, port: Int, payloadBase64: String, timeoutMs: Int, framed: String ->
      exchangeTcp(host, port, payloadBase64, timeoutMs.coerceIn(300, 8_000), framed)
    }

    AsyncFunction("ssdpSearch") { payloads: List<String>, timeoutMs: Int ->
      searchSsdp(payloads.take(8), timeoutMs.coerceIn(500, 8_000))
    }

    AsyncFunction("mdnsBrowse") { types: List<String>, timeoutMs: Int ->
      browseMdns(types.take(6), timeoutMs.coerceIn(500, 5_000))
    }

    AsyncFunction("bleScan") { timeoutMs: Int ->
      scanBle(timeoutMs.coerceIn(500, 10_000))
    }

    AsyncFunction("bleInspect") { address: String, timeoutMs: Int ->
      inspectBle(address, timeoutMs.coerceIn(1_000, 15_000))
    }

    AsyncFunction("listUsbDevices") {
      listUsb()
    }

    AsyncFunction("socketOpen") { host: String, port: Int, tls: Boolean, timeoutMs: Int ->
      openSocket(host, port, tls, timeoutMs.coerceIn(300, 10_000))
    }

    AsyncFunction("socketWrite") { id: String, payloadBase64: String ->
      val session = sessions[id] ?: throw IllegalStateException("Socket fermé")
      session.socket.getOutputStream().write(android.util.Base64.decode(payloadBase64, android.util.Base64.DEFAULT))
      session.socket.getOutputStream().flush()
    }

    AsyncFunction("socketRead") { id: String, timeoutMs: Int, maxBytes: Int ->
      val session = sessions[id] ?: throw IllegalStateException("Socket fermé")
      val bytes = session.buffer.take(timeoutMs.coerceIn(50, 30_000).toLong(), maxBytes.coerceIn(1, 65_536))
      android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
    }

    AsyncFunction("socketClose") { id: String ->
      sessions.remove(id)?.close()
      Unit
    }
  }

  private fun context(): Context {
    return appContext.reactContext ?: throw IllegalStateException("Contexte Android indisponible")
  }

  private fun readActiveNetwork(): Map<String, Any?> {
    val context = context()
    val connectivity = context.getSystemService(ConnectivityManager::class.java)
    val network = connectivity.activeNetwork
    val capabilities = network?.let { connectivity.getNetworkCapabilities(it) }
    val link = network?.let { connectivity.getLinkProperties(it) }
    val ipv4 = link?.linkAddresses?.firstOrNull { it.address is Inet4Address }
    val transport = when {
      capabilities == null -> "none"
      capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
      capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
      capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
      else -> "other"
    }
    val wifi = context.applicationContext.getSystemService(WifiManager::class.java)
    @Suppress("DEPRECATION")
    val info = if (transport == "wifi") wifi?.connectionInfo else null
    val rawSsid = info?.ssid?.trim('"')
    val ssid = rawSsid?.takeIf { it.isNotBlank() && it != "<unknown ssid>" }
    val frequency = info?.frequency?.takeIf { it > 0 }
    return mapOf(
      "connected" to (network != null && transport != "none"),
      "ssid" to ssid,
      "ipAddress" to ipv4?.address?.hostAddress,
      "prefixLength" to ipv4?.prefixLength,
      "interfaceName" to link?.interfaceName,
      "transport" to transport,
      "frequencyMhz" to frequency,
      "vpn" to (capabilities?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) == true)
    )
  }

  private fun collectUdp(hosts: List<String>, port: Int, payloadBase64: String, timeoutMs: Int): List<Map<String, Any?>> {
    if (hosts.isEmpty() || port !in 1..65535) throw IllegalArgumentException("Cible UDP invalide")
    val payload = android.util.Base64.decode(payloadBase64, android.util.Base64.DEFAULT)
    if (payload.size > 2048) throw IllegalArgumentException("Paquet UDP trop grand")
    val socket = DatagramSocket(null)
    socket.reuseAddress = true
    socket.broadcast = true
    socket.bind(InetSocketAddress(0))
    val replies = mutableListOf<Map<String, Any?>>()
    try {
      for (host in hosts.distinct().take(4)) {
        val address = InetAddress.getByName(host)
        socket.send(DatagramPacket(payload, payload.size, address, port))
      }
      val deadline = System.currentTimeMillis() + timeoutMs
      while (System.currentTimeMillis() < deadline && replies.size < 40) {
        socket.soTimeout = (deadline - System.currentTimeMillis()).toInt().coerceAtLeast(1)
        val buffer = ByteArray(8192)
        val packet = DatagramPacket(buffer, buffer.size)
        try {
          socket.receive(packet)
        } catch (_: SocketTimeoutException) {
          break
        }
        val bytes = packet.data.copyOf(packet.length)
        replies += mapOf(
          "host" to packet.address.hostAddress,
          "port" to packet.port,
          "payloadBase64" to android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP)
        )
      }
    } finally {
      socket.close()
    }
    return replies
  }

  private fun exchangeTcp(host: String, port: Int, payloadBase64: String, timeoutMs: Int, framed: String): String {
    val payload = android.util.Base64.decode(payloadBase64, android.util.Base64.DEFAULT)
    val socket = Socket()
    socket.connect(InetSocketAddress(host, port), timeoutMs)
    socket.soTimeout = timeoutMs
    try {
      socket.getOutputStream().write(payload)
      socket.getOutputStream().flush()
      val input = socket.getInputStream()
      val body = if (framed == "kasa") {
        val header = readFully(input, 4, timeoutMs)
        val length = ((header[0].toInt() and 0xFF) shl 24) or
          ((header[1].toInt() and 0xFF) shl 16) or
          ((header[2].toInt() and 0xFF) shl 8) or
          (header[3].toInt() and 0xFF)
        if (length <= 0 || length > 1_000_000) throw IllegalStateException("Trame Kasa invalide")
        header + readFully(input, length, timeoutMs)
      } else {
        val output = ByteArrayOutputStream()
        val buffer = ByteArray(4096)
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline && output.size() < 262_144) {
          if (input.available() == 0) {
            Thread.sleep(30)
            continue
          }
          val read = input.read(buffer)
          if (read < 0) break
          output.write(buffer, 0, read)
        }
        output.toByteArray()
      }
      return android.util.Base64.encodeToString(body, android.util.Base64.NO_WRAP)
    } finally {
      socket.close()
    }
  }

  private fun readFully(input: java.io.InputStream, length: Int, timeoutMs: Int): ByteArray {
    val out = ByteArray(length)
    var offset = 0
    val deadline = System.currentTimeMillis() + timeoutMs
    while (offset < length) {
      if (System.currentTimeMillis() > deadline) throw SocketTimeoutException("Réponse incomplète")
      val read = input.read(out, offset, length - offset)
      if (read < 0) throw IllegalStateException("Connexion fermée avant la fin de la réponse")
      offset += read
    }
    return out
  }

  private fun searchSsdp(payloads: List<String>, timeoutMs: Int): List<String> {
    if (payloads.isEmpty()) return emptyList()
    val context = context()
    val wifi = context.applicationContext.getSystemService(WifiManager::class.java)
    val lock = try {
      wifi?.createMulticastLock("maison-ssdp")?.apply {
        setReferenceCounted(false)
        acquire()
      }
    } catch (_: SecurityException) {
      null
    }
    val socket = DatagramSocket(null)
    socket.reuseAddress = true
    socket.broadcast = true
    socket.bind(InetSocketAddress(0))
    val replies = mutableListOf<String>()
    try {
      val group = InetAddress.getByName("239.255.255.250")
      for (payload in payloads) {
        val bytes = payload.toByteArray(Charsets.UTF_8)
        if (bytes.size > 1024) continue
        socket.send(DatagramPacket(bytes, bytes.size, group, 1900))
      }
      val deadline = System.currentTimeMillis() + timeoutMs
      while (System.currentTimeMillis() < deadline && replies.size < 40) {
        socket.soTimeout = (deadline - System.currentTimeMillis()).toInt().coerceAtLeast(1)
        val buffer = ByteArray(8192)
        val packet = DatagramPacket(buffer, buffer.size)
        try {
          socket.receive(packet)
        } catch (_: SocketTimeoutException) {
          break
        }
        replies += String(packet.data, 0, packet.length, Charsets.UTF_8)
      }
    } finally {
      socket.close()
      if (lock?.isHeld == true) lock.release()
    }
    return replies
  }

  private fun browseMdns(types: List<String>, perTypeMs: Int): List<Map<String, Any?>> {
    val safeTypes = types.filter { it.startsWith("_") && it.endsWith(".") && it.length < 80 }
    val context = context()
    val nsd = context.getSystemService(NsdManager::class.java)
      ?: throw IllegalStateException("NsdManager indisponible")
    val resolved = mutableListOf<Map<String, Any?>>()
    for (type in safeTypes) {
      val found = discoverType(nsd, type, perTypeMs)
      for (service in found) {
        resolveService(nsd, service, 2_000)?.let { info ->
          val txt = mutableMapOf<String, String>()
          info.attributes?.forEach { (key, value) ->
            txt[key] = value?.toString(Charsets.UTF_8) ?: ""
          }
          resolved += mapOf(
            "name" to info.serviceName,
            "type" to type,
            "host" to info.host?.hostAddress,
            "port" to info.port,
            "txt" to txt
          )
        }
      }
    }
    return resolved
  }

  private fun discoverType(nsd: NsdManager, type: String, timeoutMs: Int): List<NsdServiceInfo> {
    val found = mutableListOf<NsdServiceInfo>()
    val started = CountDownLatch(1)
    val listener = object : NsdManager.DiscoveryListener {
      override fun onDiscoveryStarted(serviceType: String) {
        started.countDown()
      }

      override fun onServiceFound(serviceInfo: NsdServiceInfo) {
        synchronized(found) { found += serviceInfo }
      }

      override fun onServiceLost(serviceInfo: NsdServiceInfo) = Unit
      override fun onDiscoveryStopped(serviceType: String) = Unit
      override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
        started.countDown()
      }

      override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) = Unit
    }
    mainHandler.post { nsd.discoverServices(type, NsdManager.PROTOCOL_DNS_SD, listener) }
    started.await(1_000, TimeUnit.MILLISECONDS)
    Thread.sleep(timeoutMs.toLong())
    val stopped = CountDownLatch(1)
    mainHandler.post {
      try {
        nsd.stopServiceDiscovery(listener)
      } catch (_: Exception) {
      } finally {
        stopped.countDown()
      }
    }
    stopped.await(1_000, TimeUnit.MILLISECONDS)
    return synchronized(found) { found.toList() }
  }

  private fun resolveService(nsd: NsdManager, service: NsdServiceInfo, timeoutMs: Int): NsdServiceInfo? {
    val latch = CountDownLatch(1)
    val holder = arrayOfNulls<NsdServiceInfo>(1)
    mainHandler.post {
      nsd.resolveService(service, object : NsdManager.ResolveListener {
        override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
          holder[0] = serviceInfo
          latch.countDown()
        }

        override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
          latch.countDown()
        }
      })
    }
    latch.await(timeoutMs.toLong(), TimeUnit.MILLISECONDS)
    return holder[0]
  }

  private fun scanBle(timeoutMs: Int): List<Map<String, Any?>> {
    ensurePermission(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH)
    val manager = context().getSystemService(BluetoothManager::class.java)
    val scanner = manager?.adapter?.bluetoothLeScanner
      ?: throw IllegalStateException("Bluetooth indisponible ou désactivé")
    val results = LinkedHashMap<String, Map<String, Any?>>()
    val callback = object : ScanCallback() {
      override fun onScanResult(callbackType: Int, result: ScanResult) {
        val address = result.device?.address ?: return
        val record = result.scanRecord
        val uuids = record?.serviceUuids?.map { it.uuid.toString() } ?: emptyList()
        val manufacturers = record?.manufacturerSpecificData?.let { data ->
          (0 until data.size()).map { data.keyAt(it) }
        } ?: emptyList()
        synchronized(results) {
          results[address] = mapOf(
            "address" to address,
            "name" to (result.device.name ?: record?.deviceName),
            "rssi" to result.rssi,
            "serviceUuids" to uuids,
            "manufacturerIds" to manufacturers
          )
        }
      }
    }
    val done = CountDownLatch(1)
    mainHandler.post {
      val settings = ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build()
      scanner.startScan(null, settings, callback)
      mainHandler.postDelayed({
        try {
          scanner.stopScan(callback)
        } catch (_: Exception) {
        }
        done.countDown()
      }, timeoutMs.toLong())
    }
    done.await((timeoutMs + 1_000).toLong(), TimeUnit.MILLISECONDS)
    return synchronized(results) { results.values.toList() }
  }

  private fun inspectBle(address: String, timeoutMs: Int): Map<String, Any?> {
    ensurePermission(Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH)
    val manager = context().getSystemService(BluetoothManager::class.java)
    val device = manager?.adapter?.getRemoteDevice(address)
      ?: throw IllegalStateException("Périphérique BLE introuvable")
    val services = mutableListOf<Map<String, Any?>>()
    val pending = mutableListOf<BluetoothGattCharacteristic>()
    var index = 0
    val latch = CountDownLatch(1)
    var failure: String? = null
    var gattRef: BluetoothGatt? = null

    fun finish() {
      try {
        gattRef?.disconnect()
        gattRef?.close()
      } catch (_: Exception) {
      }
      latch.countDown()
    }

    fun readNext() {
      if (index >= pending.size) {
        finish()
        return
      }
      val characteristic = pending[index]
      val readable = characteristic.properties and BluetoothGattCharacteristic.PROPERTY_READ != 0
      if (!readable) {
        index += 1
        readNext()
        return
      }
      val active = gattRef ?: return
      @Suppress("DEPRECATION")
      val started = active.readCharacteristic(characteristic)
      if (!started) {
        index += 1
        readNext()
      }
    }

    val callback = object : BluetoothGattCallback() {
      override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
        if (newState == BluetoothProfile.STATE_CONNECTED) {
          gatt.discoverServices()
        } else if (newState == BluetoothProfile.STATE_DISCONNECTED && services.isEmpty()) {
          failure = "Connexion BLE interrompue (statut $status)"
          finish()
        }
      }

      override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
        if (status != BluetoothGatt.GATT_SUCCESS) {
          failure = "Découverte GATT refusée (statut $status)"
          finish()
          return
        }
        for (service in gatt.services) {
          val characteristics = service.characteristics.map { characteristic ->
            pending += characteristic
            characteristicRecord(characteristic, null, null)
          }
          services += mapOf(
            "uuid" to service.uuid.toString(),
            "characteristics" to characteristics
          )
        }
        readNext()
      }

      override fun onCharacteristicRead(
        gatt: BluetoothGatt,
        characteristic: BluetoothGattCharacteristic,
        value: ByteArray,
        status: Int
      ) {
        recordRead(characteristic, value, status)
        index += 1
        readNext()
      }

      @Deprecated("API 33")
      override fun onCharacteristicRead(
        gatt: BluetoothGatt,
        characteristic: BluetoothGattCharacteristic,
        status: Int
      ) {
        if (Build.VERSION.SDK_INT >= 33) return
        @Suppress("DEPRECATION")
        recordRead(characteristic, characteristic.value, status)
        index += 1
        readNext()
      }

      private fun recordRead(characteristic: BluetoothGattCharacteristic, value: ByteArray?, status: Int) {
        val error = if (status == BluetoothGatt.GATT_SUCCESS) null else "Lecture refusée (statut $status). Aucun appairage n'a été lancé."
        val encoded = if (status == BluetoothGatt.GATT_SUCCESS && value != null) {
          android.util.Base64.encodeToString(value, android.util.Base64.NO_WRAP)
        } else null
        replaceCharacteristic(services, characteristic, encoded, error)
      }
    }

    mainHandler.post {
      gattRef = device.connectGatt(context(), false, callback, BluetoothDevice.TRANSPORT_LE)
    }
    if (!latch.await(timeoutMs.toLong(), TimeUnit.MILLISECONDS)) {
      finish()
      throw IllegalStateException("Délai dépassé pendant l'inspection GATT")
    }
    if (failure != null && services.isEmpty()) throw IllegalStateException(failure)
    return mapOf(
      "address" to address,
      "name" to device.name,
      "services" to services
    )
  }

  private fun characteristicRecord(
    characteristic: BluetoothGattCharacteristic,
    value: String?,
    error: String?
  ): Map<String, Any?> {
    val properties = mutableListOf<String>()
    val flags = characteristic.properties
    if (flags and BluetoothGattCharacteristic.PROPERTY_READ != 0) properties += "read"
    if (flags and BluetoothGattCharacteristic.PROPERTY_WRITE != 0) properties += "write"
    if (flags and BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE != 0) properties += "write-without-response"
    if (flags and BluetoothGattCharacteristic.PROPERTY_NOTIFY != 0) properties += "notify"
    if (flags and BluetoothGattCharacteristic.PROPERTY_INDICATE != 0) properties += "indicate"
    return mapOf(
      "uuid" to characteristic.uuid.toString(),
      "properties" to properties,
      "valueBase64" to value,
      "error" to error
    )
  }

  private fun replaceCharacteristic(
    services: MutableList<Map<String, Any?>>,
    characteristic: BluetoothGattCharacteristic,
    value: String?,
    error: String?
  ) {
    val serviceUuid = characteristic.service?.uuid?.toString() ?: return
    val index = services.indexOfFirst { it["uuid"] == serviceUuid }
    if (index < 0) return
    val current = services[index]
    @Suppress("UNCHECKED_CAST")
    val characteristics = (current["characteristics"] as List<Map<String, Any?>>).map { item ->
      if (item["uuid"] == characteristic.uuid.toString()) characteristicRecord(characteristic, value, error) else item
    }
    services[index] = mapOf("uuid" to serviceUuid, "characteristics" to characteristics)
  }

  private fun listUsb(): List<Map<String, Any?>> {
    val usb = context().getSystemService(UsbManager::class.java) ?: return emptyList()
    return usb.deviceList.values.map { device ->
      val interfaces = (0 until device.interfaceCount).map { index ->
        val item = device.getInterface(index)
        mapOf(
          "id" to item.id,
          "class" to item.interfaceClass,
          "subclass" to item.interfaceSubclass,
          "protocol" to item.interfaceProtocol
        )
      }
      val product = try {
        device.productName
      } catch (_: SecurityException) {
        null
      }
      val manufacturer = try {
        device.manufacturerName
      } catch (_: SecurityException) {
        null
      }
      mapOf(
        "deviceName" to device.deviceName,
        "vendorId" to device.vendorId,
        "productId" to device.productId,
        "deviceClass" to device.deviceClass,
        "productName" to product,
        "manufacturerName" to manufacturer,
        "interfaceCount" to device.interfaceCount,
        "interfaces" to interfaces
      )
    }
  }

  private fun openSocket(host: String, port: Int, tls: Boolean, timeoutMs: Int): String {
    val socket: Socket = if (tls) {
      val factory = javax.net.ssl.SSLSocketFactory.getDefault() as javax.net.ssl.SSLSocketFactory
      val secure = factory.createSocket() as SSLSocket
      secure.connect(InetSocketAddress(host, port), timeoutMs)
      secure.startHandshake()
      secure
    } else {
      Socket().also { it.connect(InetSocketAddress(host, port), timeoutMs) }
    }
    socket.soTimeout = 0
    val id = UUID.randomUUID().toString()
    val session = SocketSession(socket)
    sessions[id] = session
    Thread {
      try {
        val input = socket.getInputStream()
        val buffer = ByteArray(8192)
        while (!socket.isClosed) {
          val read = input.read(buffer)
          if (read < 0) break
          session.buffer.append(buffer.copyOf(read))
        }
      } catch (_: Exception) {
      } finally {
        session.closed = true
        session.buffer.wake()
      }
    }.start()
    return id
  }

  private fun ensurePermission(modern: String, legacy: String) {
    val permission = if (Build.VERSION.SDK_INT >= 31) modern else legacy
    val granted = ContextCompat.checkSelfPermission(context(), permission) == PackageManager.PERMISSION_GRANTED
    if (!granted) throw SecurityException("Permission Android manquante: $permission")
  }
}

private class ByteBufferBox {
  private val output = ByteArrayOutputStream()
  private val lock = Object()

  fun append(bytes: ByteArray) {
    synchronized(lock) {
      output.write(bytes)
      lock.notifyAll()
    }
  }

  fun wake() {
    synchronized(lock) { lock.notifyAll() }
  }

  fun take(timeoutMs: Long, maxBytes: Int): ByteArray {
    synchronized(lock) {
      val started = System.currentTimeMillis()
      while (output.size() == 0) {
        val remaining = timeoutMs - (System.currentTimeMillis() - started)
        if (remaining <= 0) return ByteArray(0)
        lock.wait(remaining)
      }
      val all = output.toByteArray()
      val count = min(maxBytes, all.size)
      output.reset()
      if (count < all.size) output.write(all, count, all.size - count)
      return all.copyOf(count)
    }
  }
}

private class SocketSession(val socket: Socket) {
  val buffer = ByteBufferBox()
  @Volatile var closed: Boolean = false

  fun close() {
    closed = true
    try {
      socket.close()
    } catch (_: Exception) {
    }
    buffer.wake()
  }
}
