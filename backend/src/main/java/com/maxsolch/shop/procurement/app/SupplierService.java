package com.maxsolch.shop.procurement.app;

import com.maxsolch.shop.platform.error.DomainException;
import com.maxsolch.shop.procurement.domain.ProcurementError;
import com.maxsolch.shop.procurement.domain.Supplier;
import com.maxsolch.shop.procurement.infra.SupplierRepository;
import com.maxsolch.shop.procurement.app.BatchDtos.SupplierDto;
import com.maxsolch.shop.procurement.app.BatchDtos.SupplierRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

/** The suppliers of batches: the list for the picker and adding a new one. */
@Service
public class SupplierService {

    private final SupplierRepository suppliers;

    public SupplierService(SupplierRepository suppliers) {
        this.suppliers = suppliers;
    }

    @Transactional(readOnly = true)
    public List<SupplierDto> suppliers() {
        return suppliers.findAllByOrderByNameAsc().stream()
                .map(s -> new SupplierDto(s.getId(), s.getName(), s.getNote())).toList();
    }

    @Transactional
    public SupplierDto createSupplier(SupplierRequest req) {
        String name = req == null || req.name() == null ? "" : req.name().trim();
        if (name.isEmpty() || name.length() > 255) {
            throw new DomainException.BadRequest(ProcurementError.BAD_NAME);
        }
        Supplier s = new Supplier();
        s.setName(name);
        s.setNote(PreorderBatchService.trimTo(req.note(), 1000));
        Supplier saved = suppliers.save(s);
        return new SupplierDto(saved.getId(), saved.getName(), saved.getNote());
    }
}
