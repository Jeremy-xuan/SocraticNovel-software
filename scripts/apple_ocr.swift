#!/usr/bin/env swift
// Apple Vision OCR — Extracts text from an image using macOS Vision framework.
// Usage: apple_ocr <image_path> [--lang zh-Hans,en-US]
// Output: recognized text lines to stdout, errors to stderr.

import Foundation
import Vision
import CoreGraphics
import ImageIO

func loadImage(from path: String) -> CGImage? {
    let url = URL(fileURLWithPath: path)
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(source, 0, nil)
}

func recognizeText(in image: CGImage, languages: [String]) -> String {
    var resultText = ""
    let semaphore = DispatchSemaphore(value: 0)

    let request = VNRecognizeTextRequest { request, error in
        defer { semaphore.signal() }
        if let error = error {
            fputs("Vision error: \(error.localizedDescription)\n", stderr)
            return
        }
        guard let observations = request.results as? [VNRecognizedTextObservation] else { return }
        // Sort by vertical position (top to bottom)
        let sorted = observations.sorted { $0.boundingBox.origin.y > $1.boundingBox.origin.y }
        let lines = sorted.compactMap { $0.topCandidates(1).first?.string }
        resultText = lines.joined(separator: "\n")
    }

    request.recognitionLevel = .accurate
    request.recognitionLanguages = languages
    request.usesLanguageCorrection = true

    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    do {
        try handler.perform([request])
        semaphore.wait()
    } catch {
        fputs("Failed to perform OCR: \(error.localizedDescription)\n", stderr)
    }
    return resultText
}

// --- Main ---
let args = CommandLine.arguments
guard args.count >= 2 else {
    fputs("Usage: apple_ocr <image_path> [--lang zh-Hans,en-US]\n", stderr)
    exit(1)
}

let imagePath = args[1]
var languages = ["zh-Hans", "en-US"]

if let langIdx = args.firstIndex(of: "--lang"), langIdx + 1 < args.count {
    languages = args[langIdx + 1].split(separator: ",").map(String.init)
}

guard let image = loadImage(from: imagePath) else {
    fputs("Failed to load image: \(imagePath)\n", stderr)
    exit(1)
}

let text = recognizeText(in: image, languages: languages)
print(text)
