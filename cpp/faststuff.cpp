// cpp/faststuff.cpp

#include <pybind11/pybind11.h>   // pybind11 core
#include <string>               // std::string

namespace py = pybind11;        // alias

// A tiny example function (placeholder)
bool looks_suspicious(const std::string& s) {
    // This is NOT real security; just an example of a C++ utility.
    // Real security comes from ORM/parameterization.
    return s.find("--") != std::string::npos || s.find(";") != std::string::npos;
}

PYBIND11_MODULE(faststuff, m) {
    m.doc() = "Fast C++ helpers for TravelApp";             // module docstring
    m.def("looks_suspicious", &looks_suspicious, "Demo");   // expose function
}
