import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AdminManagedStaff } from './admin-managed-staff';

describe('AdminManagedStaff', () => {
  let component: AdminManagedStaff;
  let fixture: ComponentFixture<AdminManagedStaff>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminManagedStaff]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AdminManagedStaff);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
