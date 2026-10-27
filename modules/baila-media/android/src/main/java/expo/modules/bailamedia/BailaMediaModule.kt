package expo.modules.bailamedia

import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.Build
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.UUID

@UnstableApi
class BailaMediaModule : Module() {
  private var transformer: Transformer? = null
  private var activePromise: Promise? = null
  private var activeOutput: File? = null

  override fun definition() = ModuleDefinition {
    Name("BailaMedia")

    AsyncFunction("getInfoAsync") { uri: String ->
      val context = appContext.reactContext ?: throw IllegalStateException("App context is unavailable")
      val input = ownedFile(uri)
      val retriever = MediaMetadataRetriever()
      try {
        retriever.setDataSource(context, Uri.fromFile(input))
        val duration = (retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toDouble() ?: 0.0) / 1000.0
        require(duration > 0) { "This video has no playable duration. Try an H.264 MP4." }
        val width = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)?.toInt() ?: 0
        val height = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)?.toInt() ?: 0
        val folder = File(context.filesDir, "bailacue-thumbnails").apply { mkdirs() }
        val preview = File(folder, "${UUID.randomUUID()}.jpg")
        var thumbnail: String? = null
        try {
          val bitmap = if (Build.VERSION.SDK_INT >= 27) {
            retriever.getScaledFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC, 480, 480)
          } else {
            retriever.getFrameAtTime(0, MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
          }
          if (bitmap != null) {
            preview.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, 75, it) }
            bitmap.recycle(); thumbnail = Uri.fromFile(preview).toString()
          }
        } catch (_: Exception) { preview.delete() }
        mapOf("duration" to duration, "width" to width, "height" to height, "thumbnail" to thumbnail)
      } finally { retriever.release() }
    }

    AsyncFunction("trimAsync") { uri: String, start: Double, end: Double, promise: Promise ->
      try {
        check(transformer == null) { "Another clip is being exported. Wait for it to finish." }
        require(start.isFinite() && end.isFinite() && start >= 0 && end - start >= 0.25) { "Choose a valid section of at least 0.25 seconds." }
        val context = appContext.reactContext ?: throw IllegalStateException("App context is unavailable")
        val input = ownedFile(uri)
        val retriever = MediaMetadataRetriever()
        val duration = try { retriever.setDataSource(input.path); (retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toDouble() ?: 0.0) / 1000.0 } finally { retriever.release() }
        require(end <= duration + 0.001) { "The section ends after the video." }
        val folder = File(context.filesDir, "bailacue-exports").apply { mkdirs() }
        val output = File(folder, "BailaCue-${UUID.randomUUID()}.mp4")
        activeOutput = output; activePromise = promise
        val inputItem = MediaItem.Builder().setUri(Uri.fromFile(input)).setClippingConfiguration(
          MediaItem.ClippingConfiguration.Builder().setStartPositionMs((start * 1000).toLong()).setEndPositionMs((end * 1000).toLong()).build()
        ).build()
        val edited = EditedMediaItem.Builder(inputItem).build()
        transformer = Transformer.Builder(context)
          .setVideoMimeType(MimeTypes.VIDEO_H264).setAudioMimeType(MimeTypes.AUDIO_AAC)
          .addListener(object : Transformer.Listener {
            override fun onCompleted(composition: Composition, exportResult: ExportResult) {
              transformer = null; activeOutput = null; activePromise = null
              promise.resolve(mapOf("uri" to Uri.fromFile(output).toString(), "duration" to (end - start)))
            }
            override fun onError(composition: Composition, exportResult: ExportResult, exception: ExportException) {
              output.delete(); transformer = null; activeOutput = null; activePromise = null
              promise.reject("EXPORT_FAILED", "This clip could not be exported (${exception.errorCodeName}). Try a different section or an H.264 MP4.", exception)
            }
          }).build()
        transformer!!.start(edited, output.absolutePath)
      } catch (exception: Exception) {
        if (activePromise === promise) { activeOutput?.delete(); activeOutput = null; activePromise = null; transformer = null }
        promise.reject("EXPORT_FAILED", exception.message ?: "The video could not be exported.", exception)
      }
    }.runOnQueue(expo.modules.kotlin.functions.Queues.MAIN)

    AsyncFunction("cancelExport") {
      transformer?.cancel(); transformer = null; activeOutput?.delete(); activeOutput = null
      activePromise?.reject("EXPORT_CANCELLED", "Export cancelled. The original is unchanged.", null); activePromise = null
    }.runOnQueue(expo.modules.kotlin.functions.Queues.MAIN)

    OnDestroy {
      android.os.Handler(android.os.Looper.getMainLooper()).post {
        transformer?.cancel(); transformer = null; activeOutput?.delete(); activeOutput = null
        activePromise?.reject("EXPORT_CANCELLED", "The app closed during export. Please try again.", null); activePromise = null
      }
    }
  }

  private fun ownedFile(uri: String): File {
    val context = appContext.reactContext ?: throw IllegalStateException("App context is unavailable")
    val parsed = Uri.parse(uri)
    require(parsed.scheme == "file") { "Import this video before editing it." }
    val file = File(parsed.path ?: "").canonicalFile
    val allowed = listOf(context.filesDir.canonicalFile, context.cacheDir.canonicalFile)
    require(allowed.any { file.path.startsWith(it.path + File.separator) } && file.isFile) { "This local video is unavailable. Import it again." }
    return file
  }
}
